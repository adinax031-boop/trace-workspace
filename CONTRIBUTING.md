# Contributing to Trace

Thanks for helping thoughtful builders keep their reasoning.

1. Fork the repository and create a branch for one focused change.
2. Use Node 24.14+ and configure a local workspace password.
3. Run `npm run check` and `npm test`.
4. For interface changes, check desktop and mobile widths, keyboard navigation, and reduced motion. Include a screenshot without personal data.
5. Open a pull request explaining the problem, resulting behavior, and validation.

Keep runtime dependencies at zero unless the benefit justifies their maintenance cost. Never render user content as HTML. Preserve export compatibility; document database changes and migrations. New API behavior should include meaningful integration coverage.

Please be respectful and specific when reviewing. Ideas and implementations are open to criticism; people deserve courtesy.
