// Command worker is the entry point for the Skylark Go worker service. It does
// nothing but delegate to run (in app.go), which performs all wiring and
// lifecycle management, and exits with the returned status code.
package main

import "os"

func main() {
	os.Exit(run())
}
