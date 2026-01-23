Phoenix Function Mapping Explainer -

A lightweight internal tool that translates Phoenix JavaScript mapping functions into plain-English explanations for support, QA, and non-engineering partners.

Why this exists: Phoenix mapping logic is powerful, but not always easy to reason about when debugging RESO fields, answering support questions, or validating MLS behavior.

This tool bridges that gap by:
- Accepting a RESO field name
- Accepting the exact mapping function
- Producing a human-readable explanation of what the function does and why

No more mentally parsing regexes during a support escalation.


What it does - 

Given:
- A RESO field name (for example, OnMarketDate)
- A Phoenix mapping function written in JavaScript

The tool:
- Identifies which MLS fields are referenced
- Detects conditional logic such as status checks like “Coming Soon”
- Explains how placeholder values like 1800-01-01 are handled
- Summarizes the final output behavior in simple terms

The output is designed to be:
- Copy-pasteable into support tickets
- Easy to read for non-engineers
- Accurate to the source logic


Example - 

Input:
  RESO Field: OnMarketDate
  Mapping Function: (various JavaScript mapping logic)

Output: (summarized)

  Looks at OnMarketDate, ExpectedOnMarketDate, and StandardStatus
  If the listing is Coming Soon, uses ExpectedOnMarketDate unless it is a placeholder
  Otherwise, uses OnMarketDate unless it is a placeholder
  Returns empty if no valid date is available


Intended audience:
- Industry Data Support
- Industry Data Operations
- Bridge API Support
- Engineers who want quick clarity without re-parsing Phoenix JavaScript


Non-goals - 

This tool:
- Does not validate correctness of mappings
- Does not execute Phoenix logic
- Does not replace documentation or code review

It is strictly an explanation layer, not a source of truth.


Assumptions and conventions - 
- Placeholder dates like 1800-01-01 are treated as invalid
- Regex checks are described semantically
- Explanations prioritize clarity over literal code translation


Docs -
- `docs/LOCAL_SETUP_README.md` - local setup (quick + from scratch)
- `docs/HOW_TO_USE_README.md` - how to use the backend and UI
- `docs/TECHNICAL_OVERVIEW.md` - system overview
- `docs/archive/` - previous setup drafts
