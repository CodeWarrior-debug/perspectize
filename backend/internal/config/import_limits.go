package config

import "fmt"

// Code defaults for the global import concurrency caps: initial values, not
// fixed rules. Rows is half of the measured max at the smallest database pool
// measured. Listings is kept inside ImportPoolWarning's pool-reserve rule at the
// code-default pool together with the row default (half of its measured max
// would be higher). The measurement, its environment and the open decisions are
// in .docs/CAPACITY_REGISTER.md. Either can be overridden per environment with
// the variables read by LoadImportLimits.
const (
	DefaultImportRowConcurrency     = 4
	DefaultImportListingConcurrency = 8
)

// ImportLimits caps how much import work runs at once across all users.
type ImportLimits struct {
	RowConcurrency     int // rows being imported at once (IMPORT_ROW_CONCURRENCY)
	ListingConcurrency int // source listings running at once (IMPORT_LISTING_CONCURRENCY)
}

// LoadImportLimits reads the caps from the environment. An unset, empty,
// non-numeric or non-positive value keeps the default: a zero cap would stall
// every import.
func LoadImportLimits() ImportLimits {
	return ImportLimits{
		RowConcurrency:     getEnvInt("IMPORT_ROW_CONCURRENCY", DefaultImportRowConcurrency),
		ListingConcurrency: getEnvInt("IMPORT_LISTING_CONCURRENCY", DefaultImportListingConcurrency),
	}
}

// ImportPoolWarning reports whether the caps put too much of the database pool
// at risk: it warns when twice the combined caps reach poolMax, i.e. imports
// could take half the pool or more. Exactly half warns too, so the message says
// "half or more" and asks for more than half to stay free. It only advises;
// startup never refuses. An unknown pool size (poolMax <= 0) gives no warning.
func ImportPoolWarning(l ImportLimits, poolMax int) (msg string, warn bool) {
	if poolMax <= 0 || 2*(l.RowConcurrency+l.ListingConcurrency) < poolMax {
		return "", false
	}
	return fmt.Sprintf(
		"import concurrency caps (rows %d, listings %d) could take half of the database pool of %d connections or more: "+
			"more than half of the pool should stay free for user requests; "+
			"lower IMPORT_ROW_CONCURRENCY / IMPORT_LISTING_CONCURRENCY or raise DB_MAX_OPEN_CONNS",
		l.RowConcurrency, l.ListingConcurrency, poolMax), true
}
