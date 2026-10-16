package engine

import (
	"strings"
	"unicode/utf8"

	calendarv1 "github.com/yitztech/micitaentiempo.online/services/calendar/gen/mcet/calendar/v1"
)

// validText aplica las mismas unidades UTF-16 y controles que Zod y maxlength.
func validText(value string, maxUnits int, multiline bool) bool {
	if !utf8.ValidString(value) {
		return false
	}
	units := 0
	for _, ch := range value {
		units++
		if ch > 65535 {
			units++
		}
		if units > maxUnits || (ch < 32 && !(multiline && (ch == '\t' || ch == '\n' || ch == '\r'))) ||
			(ch >= 127 && ch <= 159) || (ch >= 8234 && ch <= 8238) || (ch >= 8294 && ch <= 8297) ||
			(!multiline && (ch == '<' || ch == '>')) {
			return false
		}
	}
	return true
}

func validName(value string) bool {
	return strings.TrimSpace(value) != "" && validText(value, 120, false)
}
func validAttendee(value *calendarv1.Attendee) bool {
	return value == nil || (validText(value.GetName(), 120, false) && validText(value.GetEmail(), 254, false) && validText(value.GetPhone(), 16, false))
}
