package engine

import (
	"context"
	"sort"
	"strconv"
	"time"

	"connectrpc.com/connect"
	calendarv1 "github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/calendar/v1"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/domain"
	"github.com/yitztech/micitaentiempo.online/services/calendar/internal/store"
)

// StatsServer implementa mcet.calendar.v1.StatsService.
type StatsServer struct{ *Engine }

func counts(m map[string]int) []*calendarv1.CountByKey {
	out := make([]*calendarv1.CountByKey, 0, len(m))
	for k, v := range m {
		out = append(out, &calendarv1.CountByKey{Key: k, Count: i32(v)})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].GetCount() != out[j].GetCount() {
			return out[i].GetCount() > out[j].GetCount()
		}
		return out[i].GetKey() < out[j].GetKey()
	})
	return out
}

// GetStats resume las citas y bloqueos de un rango (propietario y editores).
func (s StatsServer) GetStats(ctx context.Context, req *calendarv1.GetStatsRequest) (*calendarv1.GetStatsResponse, error) {
	c, a, err := s.calendar(ctx, req.GetCalendarId(), false)
	if err != nil {
		return nil, err
	}
	if err := requireOrg(a, c.OrgID, "owner", "editor"); err != nil {
		return nil, err
	}
	if req.GetFrom() == nil || req.GetTo() == nil {
		return nil, fail(connect.CodeInvalidArgument, "invalid_range", "faltan desde y hasta")
	}
	from, to := req.GetFrom().AsTime(), req.GetTo().AsTime()
	if !to.After(from) || to.Sub(from) > maxListWindow {
		return nil, fail(connect.CodeInvalidArgument, "invalid_range", "rango de 1 minuto a 400 días")
	}
	loc, err := location(c.Timezone)
	if err != nil {
		return nil, err
	}
	evs, err := store.ListEvents(ctx, s.Store.Pool, c.ID, from, to, "", true)
	if err != nil {
		return nil, err
	}
	out := &calendarv1.GetStatsResponse{}
	byService, byWeekday, byHour, byVia := map[string]int{}, map[string]int{}, map[string]int{}, map[string]int{}
	customers := map[string]bool{}
	for _, ev := range evs {
		minutes := int(ev.End.Sub(ev.Start) / time.Minute)
		if ev.Kind == "block" {
			if ev.Status == "confirmed" {
				out.BlockedMinutes += i32(minutes)
			}
			continue
		}
		switch ev.Status {
		case "cancelled":
			if ev.CancelReason != "hold_expired" && ev.CancelReason != "released" {
				out.Cancelled++
			}
			continue
		case "held":
			continue
		}
		out.Confirmed++
		out.BookedMinutes += i32(minutes)
		switch ev.Attendance {
		case "attended":
			out.Attended++
		case "no_show":
			out.NoShow++
		}
		if ev.CustomerUserID != "" {
			customers[ev.CustomerUserID] = true
		}
		l := ev.Start.In(loc)
		byService[ev.ServiceID]++
		byWeekday[strconv.Itoa(domain.DateOf(l).ISOWeekday())]++
		byHour[strconv.Itoa(l.Hour())]++
		byVia[ev.CreatedVia]++
	}
	out.Customers = i32(len(customers))
	out.ByService, out.ByWeekday, out.ByHour, out.ByVia = counts(byService), counts(byWeekday), counts(byHour), counts(byVia)
	return out, nil
}
