package extsync

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/store"
)

// writeTarget devuelve el calendario donde escribimos en una conexión (si hay).
func writeTarget(ctx context.Context, s *Syncer, connID string) (store.ExternalCalendar, bool, error) {
	exts, err := store.ExternalCalendars(ctx, s.Store.Pool, connID)
	if err != nil {
		return store.ExternalCalendar{}, false, err
	}
	for _, x := range exts {
		if x.WriteTarget {
			return x, true, nil
		}
	}
	return store.ExternalCalendar{}, false, nil
}

// outgoing describe nuestro evento para el calendario del propietario (es suyo: va con detalles).
func (s *Syncer) outgoing(ctx context.Context, c store.Calendar, ev store.Event) Outgoing {
	parts := []string{}
	if ev.Title != "" {
		parts = append(parts, ev.Title)
	} else if ev.Attendee.Name != "" {
		parts = append(parts, ev.Attendee.Name)
	}
	if ev.ServiceID != "" {
		if sv, err := s.Store.GetService(ctx, c.ID, ev.ServiceID); err == nil {
			for _, n := range []string{sv.Name["es"], sv.Name["en"]} {
				if n != "" {
					parts = append(parts, n)
					break
				}
			}
		}
	}
	if len(parts) == 0 {
		parts = append(parts, c.Name)
	}
	desc := []string{"Mi Cita en Tiempo · " + c.Name}
	if ev.Attendee.Email != "" {
		desc = append(desc, ev.Attendee.Email)
	}
	if ev.Attendee.Phone != "" {
		desc = append(desc, ev.Attendee.Phone)
	}
	return Outgoing{
		EventID: ev.ID, ICalUID: ev.ICalUID, Summary: strings.Join(parts, " · "), Description: strings.Join(desc, "\n"),
		Location: c.Address, Start: ev.Start, End: ev.End, Sequence: ev.ICalSequence,
	}
}

// Push escribe (o borra) un evento en las conexiones del tablero con destino de escritura. Las
// instancias de una serie se escriben todas las de la ventana.
func (s *Syncer) Push(ctx context.Context, calendarID, eventID string) error {
	conns, err := store.ActiveConnections(ctx, s.Store.Pool, calendarID)
	if err != nil || len(conns) == 0 {
		return err
	}
	ev, err := store.GetEvent(ctx, s.Store.Pool, eventID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil
		}
		return err
	}
	events := []store.Event{ev}
	if ev.SeriesID != "" {
		if all, err := store.SeriesEvents(ctx, s.Store.Pool, ev.SeriesID, s.Clock.Now().Add(-time.Hour)); err == nil && len(all) > 0 {
			events = all
		}
	}
	c, err := s.Store.GetCalendar(ctx, calendarID)
	if err != nil {
		return err
	}
	for _, conn := range conns {
		target, ok, err := writeTarget(ctx, s, conn.ID)
		if err != nil || !ok {
			continue
		}
		p, err := s.Provider(ctx, conn)
		if err != nil {
			return err
		}
		for _, e := range events {
			if _, err := s.syncOne(ctx, p, conn, target, c, e); err != nil {
				return s.fail(ctx, conn, err)
			}
		}
		if ev.Status != "confirmed" {
			if err := s.deleteCancelled(ctx, p, conn, target); err != nil {
				return s.fail(ctx, conn, err)
			}
		}
	}
	return nil
}

// syncOne deja un evento igual en el proveedor. Devuelve true si se restauró un cambio hecho fuera.
func (s *Syncer) syncOne(ctx context.Context, p Provider, conn store.Connection, target store.ExternalCalendar, c store.Calendar, ev store.Event) (bool, error) {
	if ev.Status != "confirmed" {
		return false, nil
	}
	link, err := store.GetLink(ctx, s.Store.Pool, ev.ID, conn.ID)
	hasLink := err == nil && !link.Deleted
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		return false, err
	}
	restored := false
	remoteID := ""
	if hasLink {
		remoteID = link.ExternalID
		remote, err := p.Get(ctx, target.ExternalID, link.ExternalID)
		switch {
		case errors.Is(err, ErrGone) || (err == nil && remote.Cancelled):
			remoteID, restored = "", true // borrado fuera: se vuelve a crear
		case err != nil:
			return false, err
		case remote.Start.Equal(ev.Start) && remote.End.Equal(ev.End):
			return false, nil // al día
		case !remote.Start.Equal(link.SyncedStart) || !remote.End.Equal(link.SyncedEnd):
			restored = true // movido fuera: nuestro sistema manda
		}
	}
	id, etag, err := p.Upsert(ctx, target.ExternalID, remoteID, s.outgoing(ctx, c, ev))
	if errors.Is(err, ErrGone) && remoteID != "" {
		id, etag, err = p.Upsert(ctx, target.ExternalID, "", s.outgoing(ctx, c, ev))
	}
	if err != nil {
		return false, err
	}
	if id == "" {
		id = remoteID
	}
	return restored, store.SaveLink(ctx, s.Store.Pool, store.Link{EventID: ev.ID, ConnectionID: conn.ID, ExternalID: id, ETag: etag, SyncedStart: ev.Start, SyncedEnd: ev.End})
}

func (s *Syncer) deleteCancelled(ctx context.Context, p Provider, conn store.Connection, target store.ExternalCalendar) error {
	links, err := store.LinksOfCancelled(ctx, s.Store.Pool, conn.ID)
	if err != nil {
		return err
	}
	for _, l := range links {
		if err := p.Delete(ctx, target.ExternalID, l.ExternalID); err != nil {
			return err
		}
		l.Deleted = true
		if err := store.SaveLink(ctx, s.Store.Pool, l); err != nil {
			return err
		}
	}
	return nil
}

// Reconcile (cada 10 min y al llegar un aviso): ocupado de 14 días, eventos escritos al día (se
// restauran los cambios hechos fuera), borrados pendientes y canales por caducar.
func (s *Syncer) Reconcile(ctx context.Context, connectionID string) error {
	conn, err := store.GetConnection(ctx, s.Store.Pool, connectionID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil
		}
		return err
	}
	if conn.Status == "revoked" {
		return nil
	}
	if err := s.RefreshBusy(ctx, conn); err != nil {
		return err
	}
	target, ok, err := writeTarget(ctx, s, conn.ID)
	if err != nil {
		return err
	}
	if ok {
		p, err := s.Provider(ctx, conn)
		if err != nil {
			return err
		}
		c, err := s.Store.GetCalendar(ctx, conn.CalendarID)
		if err != nil {
			return err
		}
		now := s.Clock.Now()
		events, err := store.EventsToPush(ctx, s.Store.Pool, c.ID, now.Add(-time.Hour), now.Add(PushWindow))
		if err != nil {
			return err
		}
		restored := 0
		for _, ev := range events {
			r, err := s.syncOne(ctx, p, conn, target, c, ev)
			if err != nil {
				return s.fail(ctx, conn, err)
			}
			if r {
				restored++
			}
		}
		if err := s.deleteCancelled(ctx, p, conn, target); err != nil {
			return s.fail(ctx, conn, err)
		}
		if restored > 0 {
			s.emit(ctx, "sync.restored", conn, map[string]any{"count": restored})
		}
		if target.AppCreated && (target.ChannelExpiresAt == nil || target.ChannelExpiresAt.Before(now.Add(24*time.Hour))) {
			s.watch(ctx, p, conn, target)
		}
	}
	return store.SetConnectionHealth(ctx, s.Store.Pool, conn.ID, "active", "", s.Clock.Now())
}
