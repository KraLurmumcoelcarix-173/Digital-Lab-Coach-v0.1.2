from dlc.analyzer.wire_completeness import Issue, IssueSeverity

KIND = "official_test_mismatch"

_FIX_MODIFIED = "Open Settings → Official tests to see the rows that count."
_FIX_MISSING = "Open Settings → Official tests to see the rows that will run."


def check_official_test_match(circuit, filename: str) -> list[Issue]:
    from dlc.testing.inject import file_test_status

    try:
        status = file_test_status(circuit, filename)
    except Exception:
        return []
    if status not in ("modified", "missing"):
        return []

    if status == "missing":
        title = "This file has no test rows of its own"
        message = ("An official test is registered for this file, but the "
                   "file carries no rows. Test runs use the official test, "
                   "so the result you see still matches your grade.")
        fix = _FIX_MISSING
    else:
        title = "Your testcase is not the official test"
        message = ("An official test is registered for this file, and the "
                   "rows in it are not the official ones. Test runs use the "
                   "official test instead, so the result you see still "
                   "matches your grade. Your own rows stay in the file, "
                   "untouched.")
        fix = _FIX_MODIFIED

    return [Issue(
        kind=KIND,
        severity=IssueSeverity.WARNING,
        title=title,
        message=message,
        suggested_fix=fix,
    )]
