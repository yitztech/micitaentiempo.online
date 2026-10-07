# PostgreSQL de Mi Cita en Tiempo: imagen oficial con configuración y roles horneados.
# Los scripts de initdb solo se ejecutan con el volumen vacío (primer arranque).
FROM postgres:18.6-alpine3.24

COPY services/postgres/postgresql.conf /etc/postgresql/postgresql.conf
COPY --chmod=755 services/postgres/initdb/ /docker-entrypoint-initdb.d/

CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
