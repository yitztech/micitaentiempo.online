#!/bin/sh
# Corre los escenarios en dos pasadas. El reloj del motor es uno para todo el entorno, así que los
# escenarios @reloj (los que lo mueven) corren solos y al final. Los argumentos pasan a ambas.
set -e
bddgen
playwright test --project escritorio --project movil --project tableta "$@"
INFORME=reloj playwright test --project reloj "$@"
