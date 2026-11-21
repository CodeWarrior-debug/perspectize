package domain

// Valid reports whether r is one of the known webpage roles. It is the name the
// import code uses; IsValid (content.go) is the same check.
func (r WebPageRole) Valid() bool {
	return r.IsValid()
}
