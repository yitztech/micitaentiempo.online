// Command calendar es el motor de calendario de Mi Cita en Tiempo.
package main

import (
	"fmt"
	"os"
)

// revision se fija en la compilación con -ldflags "-X main.revision=<sha>".
var revision = "dev"

func main() {
	if len(os.Args) > 1 && os.Args[1] == "version" {
		fmt.Println(revision)
		return
	}
	fmt.Fprintln(os.Stderr, "uso: calendar serve | migrate | healthcheck | version")
	os.Exit(2)
}
