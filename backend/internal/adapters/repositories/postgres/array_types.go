package postgres

import (
	"database/sql/driver"
	"fmt"
	"strconv"
	"strings"
)

// StringArray is a custom type for PostgreSQL text[] columns.
// It implements sql.Scanner and driver.Valuer to replace lib/pq's pq.StringArray.
type StringArray []string

// Scan implements the sql.Scanner interface for reading text[] from PostgreSQL
func (a *StringArray) Scan(src interface{}) error {
	if src == nil {
		*a = nil
		return nil
	}

	// PostgreSQL returns arrays as []byte or string depending on driver/connection
	var str string
	switch v := src.(type) {
	case []byte:
		str = string(v)
	case string:
		str = v
	default:
		return fmt.Errorf("StringArray.Scan: expected []byte or string, got %T", src)
	}

	// Handle empty array
	if str == "{}" {
		*a = []string{}
		return nil
	}

	// Remove surrounding braces
	if !strings.HasPrefix(str, "{") || !strings.HasSuffix(str, "}") {
		return fmt.Errorf("StringArray.Scan: invalid array format: %s", str)
	}
	str = str[1 : len(str)-1]

	// Parse array elements (handle quoted strings with commas/backslashes)
	var result []string
	var current strings.Builder
	inQuotes := false
	escaped := false

	for i := 0; i < len(str); i++ {
		ch := str[i]

		if escaped {
			current.WriteByte(ch)
			escaped = false
			continue
		}

		if ch == '\\' {
			escaped = true
			continue
		}

		if ch == '"' {
			inQuotes = !inQuotes
			continue
		}

		if ch == ',' && !inQuotes {
			// End of element
			elem := current.String()
			if elem == "NULL" {
				result = append(result, "")
			} else {
				result = append(result, elem)
			}
			current.Reset()
			continue
		}

		current.WriteByte(ch)
	}

	// Add last element
	elem := current.String()
	if elem == "NULL" {
		result = append(result, "")
	} else {
		result = append(result, elem)
	}

	*a = result
	return nil
}

// Value implements the driver.Valuer interface for writing text[] to PostgreSQL
func (a StringArray) Value() (driver.Value, error) {
	if a == nil {
		return nil, nil
	}

	if len(a) == 0 {
		return "{}", nil
	}

	// Size once: braces, separators, optional quotes, plus headroom for
	// escapes. jsonb[] elements are full of quotes, so growing as we go
	// would reallocate several times per array.
	n := 2
	for _, s := range a {
		n += len(s) + 3
	}
	var buf strings.Builder
	buf.Grow(n + n/8)
	buf.WriteByte('{')

	for i, s := range a {
		if i > 0 {
			buf.WriteByte(',')
		}

		// Quote strings that contain commas, quotes, backslashes, or braces
		needsQuoting := strings.ContainsAny(s, `,"\{}`)
		if needsQuoting {
			buf.WriteByte('"')
		}

		// Escape backslashes and quotes. Byte-wise is UTF-8 safe: both are
		// ASCII and never appear inside a multibyte sequence.
		for j := 0; j < len(s); j++ {
			if s[j] == '\\' || s[j] == '"' {
				buf.WriteByte('\\')
			}
			buf.WriteByte(s[j])
		}

		if needsQuoting {
			buf.WriteByte('"')
		}
	}

	buf.WriteByte('}')
	return buf.String(), nil
}

// Int64Array is a custom type for PostgreSQL bigint[] columns.
// It implements sql.Scanner and driver.Valuer to replace lib/pq's pq.Int64Array.
type Int64Array []int64

// Scan implements the sql.Scanner interface for reading bigint[] from PostgreSQL
func (a *Int64Array) Scan(src interface{}) error {
	if src == nil {
		*a = nil
		return nil
	}

	// PostgreSQL returns arrays as []byte or string depending on driver/connection
	var str string
	switch v := src.(type) {
	case []byte:
		str = string(v)
	case string:
		str = v
	default:
		return fmt.Errorf("Int64Array.Scan: expected []byte or string, got %T", src)
	}

	// Handle empty array
	if str == "{}" {
		*a = []int64{}
		return nil
	}

	// Remove surrounding braces
	if !strings.HasPrefix(str, "{") || !strings.HasSuffix(str, "}") {
		return fmt.Errorf("Int64Array.Scan: invalid array format: %s", str)
	}
	str = str[1 : len(str)-1]

	// Split by comma and parse integers
	parts := strings.Split(str, ",")
	result := make([]int64, 0, len(parts))

	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "NULL" {
			result = append(result, 0)
			continue
		}

		val, err := strconv.ParseInt(part, 10, 64)
		if err != nil {
			return fmt.Errorf("Int64Array.Scan: failed to parse int64: %w", err)
		}
		result = append(result, val)
	}

	*a = result
	return nil
}

// Value implements the driver.Valuer interface for writing bigint[] to PostgreSQL
func (a Int64Array) Value() (driver.Value, error) {
	if a == nil {
		return nil, nil
	}

	if len(a) == 0 {
		return "{}", nil
	}

	var buf strings.Builder
	buf.WriteByte('{')

	for i, val := range a {
		if i > 0 {
			buf.WriteByte(',')
		}
		buf.WriteString(strconv.FormatInt(val, 10))
	}

	buf.WriteByte('}')
	return buf.String(), nil
}

// intsToArray passes ids as ONE bigint[] parameter (use with
// "col = ANY(CAST(? AS bigint[]))") instead of GORM's "IN ?" expansion into one
// placeholder per id. The SQL text then stays the same whatever the batch
// size, so pgx's per-connection prepared-statement cache hits instead of
// paying an extra Parse round trip for every new batch length.
func intsToArray(ids []int) Int64Array {
	out := make(Int64Array, len(ids))
	for i, id := range ids {
		out[i] = int64(id)
	}
	return out
}
