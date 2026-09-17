from dlc.analyzer.wire_completeness import Issue, IssueSeverity

KIND = "unsupported_element"

# Elements that carry no signal and are meant to have no pins.
_ANNOTATIONS = {"Testcase", "Rectangle", "Text"}


def _modelled() -> set:
    from dlc.parser.pin_geometry import DYNAMIC_PIN_TABLE, STATIC_PIN_TABLE
    return set(STATIC_PIN_TABLE) | set(DYNAMIC_PIN_TABLE)


def _scan(circuit, known, names, top_indices, seen, is_top):
    if id(circuit) in seen:
        return
    seen.add(id(circuit))
    for idx, comp in enumerate(circuit.components):
        name = comp.element_name
        if (name in known or name in _ANNOTATIONS
                or not isinstance(name, str) or name.endswith(".dig")):
            continue
        names.add(name)
        if is_top:
            top_indices.append(idx)
    for sub in circuit.subcircuits:
        if sub.child_circuit is not None:
            _scan(sub.child_circuit, known, names, top_indices, seen, False)


def check_unsupported_elements(circuit) -> list[Issue]:
    """One card naming every Digital element DLC cannot model, at any depth."""
    try:
        known = _modelled()
    except Exception:
        return []
    names: set = set()
    top_indices: list = []
    _scan(circuit, known, names, top_indices, set(), True)
    if not names:
        return []

    listed = ", ".join(sorted(names))
    return [Issue(
        kind=KIND,
        severity=IssueSeverity.ERROR,
        title=f"Not supported yet: {listed}",
        message=("DLC does not model this Digital component yet, so it "
                 "cannot trace any wire through it. This is a gap in DLC, "
                 "not a mistake in your circuit. The graph draws it as a "
                 "plain box with no connections, and other findings on this "
                 "file may be wrong for the same reason. Layer 2 and Layer 3 "
                 "are unavailable here; your circuit itself may be fine."),
        component_indices=sorted(top_indices),
    )]
