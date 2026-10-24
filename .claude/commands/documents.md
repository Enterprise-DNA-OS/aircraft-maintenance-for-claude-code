---
description: Render the paperwork from the records, in your brand: maintenance status reports, work orders with the release section, and directive compliance records.
---

1. `npm run docs` renders every document. One kind: `npm run docs -- maintenance-status`, `-- work-order`, `-- ad-record`.
2. Files land in `docs-out/<kind>/`. Print to PDF from the browser, or attach as is.
3. Business name, colours and the footer come from `brand.json`. A new document type is a new entry in `documents.json`.
