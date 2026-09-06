/**
 * Builds the sample documents.
 *
 * Three PDFs to load into the app: a residential lease, a contractor agreement
 * and a tax engagement letter. They exist so the document review has something
 * real to bite on — every one of them carries language the reviewer's rules are
 * actually looking for, sitting where it would sit in a real document rather
 * than piled into a paragraph of keywords.
 *
 * Every party, address, figure and identifier is invented, and each page says
 * so in the footer. They are specimens of a form, not copies of anybody's
 * paperwork, and nothing here should ever be signed.
 *
 *   node scripts/build-samples.mjs
 *
 * Written as a script rather than checked in as three opaque binaries so the
 * wording can be reviewed in a diff like everything else.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'static', 'samples');

const STYLE = `
	@page { size: Letter; margin: 0.9in 0.85in 1in; }
	* { box-sizing: border-box; }
	body {
		margin: 0;
		font: 10.5pt/1.55 'Times New Roman', Times, serif;
		color: #111;
	}
	h1 {
		margin: 0 0 2pt;
		font-size: 15pt;
		letter-spacing: 0.04em;
		text-align: center;
		text-transform: uppercase;
	}
	.sub {
		margin: 0 0 20pt;
		text-align: center;
		font-size: 9.5pt;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #555;
	}
	h2 {
		margin: 18pt 0 6pt;
		font-size: 11pt;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 0.5pt solid #999;
		padding-bottom: 2pt;
	}
	p { margin: 0 0 8pt; text-align: justify; }
	ol.clauses { margin: 0; padding: 0; list-style: none; counter-reset: clause; }
	ol.clauses > li {
		counter-increment: clause;
		margin: 0 0 9pt;
		padding-left: 26pt;
		position: relative;
		text-align: justify;
	}
	ol.clauses > li::before {
		content: counter(clause) '.';
		position: absolute;
		left: 0;
		font-weight: bold;
	}
	.lead { font-weight: bold; }
	table { width: 100%; border-collapse: collapse; margin: 0 0 10pt; font-size: 10pt; }
	th, td { border: 0.5pt solid #aaa; padding: 4pt 6pt; text-align: left; vertical-align: top; }
	th { background: #eee; font-size: 9pt; letter-spacing: 0.04em; text-transform: uppercase; }
	td.num { text-align: right; font-variant-numeric: tabular-nums; }
	.parties { margin: 0 0 14pt; }
	.sign { margin-top: 26pt; display: flex; gap: 34pt; }
	.sign div { flex: 1; }
	.rule { border-bottom: 0.5pt solid #333; height: 26pt; }
	.cap { font-size: 8.5pt; color: #444; letter-spacing: 0.03em; }
	.note { font-size: 9.5pt; color: #333; font-style: italic; }
	.pagebreak { page-break-before: always; }
`;

const FOOTER = `
	<div style="width:100%;font:7.5pt 'Times New Roman',serif;color:#666;padding:0 0.85in;display:flex;justify-content:space-between">
		<span>SPECIMEN — prepared for a software demonstration. Parties, addresses, figures and identifiers are fictitious.</span>
		<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
	</div>`;

const HEADER = `<div style="font-size:0"></div>`;

// ---------------------------------------------------------------------- lease

const lease = `
<h1>Residential Lease Agreement</h1>
<p class="sub">Unit 3B · 1420 Maple Street · Rockledge, Ohio 44139</p>

<p class="parties">
	This Residential Lease Agreement (the “Lease”) is made on <b>March 1, 2026</b>, between
	<b>Maple &amp; Fifth Property Holdings LLC</b>, an Ohio limited liability company whose managing
	member is Dana R. Whitfield (the “Landlord”), and <b>Priya N. Raman</b> and <b>Colin T. Raman</b>
	(jointly and severally, the “Tenant”).
</p>

<h2>1. Premises and Term</h2>
<ol class="clauses">
	<li>The Landlord leases to the Tenant the residential dwelling unit known as Unit 3B, 1420 Maple
		Street, Rockledge, Ohio 44139, together with one assigned parking space (the “Premises”). The
		Premises are let unfurnished.</li>
	<li>The term of this Lease is twelve (12) months, commencing <b>April 1, 2026</b> and ending
		<b>March 31, 2027</b>. On expiry the Lease converts to a month-to-month tenancy on the same
		terms unless either party gives sixty (60) days’ written notice.</li>
	<li>The Premises shall be occupied only as a private residence by the persons named above and by
		one (1) minor child. The Tenant shall not sublet or assign without the Landlord’s prior written
		consent.</li>
</ol>

<h2>2. Rent and Payment</h2>
<ol class="clauses">
	<li>Base rent is <b>$2,150.00</b> per month, due in advance on the first day of each month without
		demand or set-off.</li>
	<li>Rent may be tendered by personal check, certified funds, or electronic transfer to the account
		designated by the Landlord. Where the Tenant elects to prepay, the Landlord will accept a
		cash payment exceeding $10,000 only by prior arrangement at the managing agent’s office,
		and will issue a written receipt.</li>
	<li>A late charge of $75.00 accrues on any instalment not received by the fifth (5th) day of the
		month. A charge of $40.00 applies to each returned payment.</li>
	<li>Upon execution the Tenant shall deposit <b>$2,150.00</b> as a security deposit, held in a
		separate account at Rockledge Savings Bank. The deposit secures the Tenant’s performance and
		is not to be applied by the Tenant toward the final month’s rent.</li>
</ol>

<h2>3. Repairs, Maintenance and Alterations</h2>
<ol class="clauses">
	<li>The Landlord shall keep the structure, roof, plumbing, heating and electrical systems in good
		working order. The Landlord’s obligation extends to ordinary
		repairs and maintenance arising from normal wear.</li>
	<li>The Tenant shall keep the Premises clean and sanitary, shall promptly notify the Landlord in
		writing of any defective or dangerous condition, and shall be responsible for the cost of
		repairing any damage caused by the Tenant or the Tenant’s guests.</li>
	<li>The Tenant shall make no alterations, additions or improvements to the property —
		including painting, fixtures, appliances or flooring — without the Landlord’s prior written
		consent. Any approved improvement becomes the property of the Landlord on termination unless
		the consent provides otherwise in writing.</li>
	<li>The Landlord anticipates replacing the unit’s heating system and the kitchen cabinetry during
		the term. The Tenant shall permit reasonable access for that work on 48 hours’ notice.</li>
</ol>

<h2>4. Utilities, Access and Conduct</h2>
<ol class="clauses">
	<li>The Tenant shall pay for electricity, gas, internet and renter’s insurance. The Landlord shall
		pay for water, sewer, refuse collection and common-area lighting.</li>
	<li>The Landlord may enter the Premises on 24 hours’ written notice to inspect, make repairs, or
		show the unit, and without notice in an emergency.</li>
	<li>No smoking is permitted anywhere on the Premises. One domestic cat is permitted under the Pet
		Addendum; no other animal may be kept.</li>
</ol>

<h2>5. Related-Party Occupancy Rider</h2>
<ol class="clauses">
	<li>The Tenant Priya N. Raman is the sister-in-law of the Landlord’s managing member. The parties
		acknowledge that this is a related-party transaction and confirm that the rent stated in
		Clause 2.1 was set by reference to two comparable units let at 1408 and 1436 Maple Street
		during February 2026.</li>
	<li>The Landlord agrees to obtain a written rental market survey annually for so long as this Rider
		remains in effect.</li>
</ol>

<h2>6. General</h2>
<ol class="clauses">
	<li>If any provision of this Lease is held unenforceable, the remaining provisions continue in full
		force.</li>
	<li>This Lease is governed by the laws of the State of Ohio. It constitutes the entire agreement
		between the parties and may be amended only in writing signed by both.</li>
</ol>

<div class="sign">
	<div>
		<div class="rule"></div>
		<div class="cap">Landlord — Maple &amp; Fifth Property Holdings LLC<br />By: Dana R. Whitfield, Managing Member</div>
	</div>
	<div>
		<div class="rule"></div>
		<div class="cap">Tenant — Priya N. Raman</div>
	</div>
	<div>
		<div class="rule"></div>
		<div class="cap">Tenant — Colin T. Raman</div>
	</div>
</div>

<div class="pagebreak"></div>
<h1 style="font-size:13pt">Schedule 3 — Owner’s Year-End Accounting Summary</h1>
<p class="sub">Prepared by Rockledge Property Management for the 2026 tax year</p>

<p class="note">
	Prepared for the owner’s records and for onward delivery to the owner’s tax preparer. Amounts are
	as recorded in the management ledger and have not been audited.
</p>

<table>
	<tr><th>Item</th><th>Basis of treatment</th><th style="width:1.1in">Amount</th></tr>
	<tr><td>Gross rents received</td><td>Cash received April–December</td><td class="num">19,350.00</td></tr>
	<tr><td>Heating system replacement</td><td>Recorded in repairs and maintenance and expensed rather than capitalized, as the unit was returned to working order</td><td class="num">6,480.00</td></tr>
	<tr><td>Kitchen cabinetry and countertops</td><td>Treated as a repair for consistency with the item above</td><td class="num">4,120.00</td></tr>
	<tr><td>Appliance package</td><td>Section 179 election intended; owner to confirm eligibility</td><td class="num">2,890.00</td></tr>
	<tr><td>Building depreciation</td><td>Straight line, per prior-year schedule carried forward</td><td class="num">7,636.00</td></tr>
	<tr><td>Owner site visits</td><td>11 round trips claimed at the standard mileage rate; no mileage log was maintained</td><td class="num">418.00</td></tr>
	<tr><td>Management fee</td><td>8% of gross rents</td><td class="num">1,548.00</td></tr>
</table>

<p>
	<b>Manager’s note.</b> In our view the heating and cabinetry work restored the unit rather than
	improved it, and both amounts are therefore fully deductible in the current year. The owner
	should be aware that this is a rental of residential real estate and that the owner does not
	materially participate in the activity within the meaning generally applied to such
	rentals.
</p>
`;

// ----------------------------------------------------------------- contractor

const contractor = `
<h1>Independent Contractor Services Agreement</h1>
<p class="sub">Northbridge Analytics, Inc. · Effective February 2, 2026</p>

<p class="parties">
	This Agreement is entered into as of <b>February 2, 2026</b> between <b>Northbridge Analytics,
	Inc.</b>, a Delaware corporation with offices at 200 Harbor Way, Suite 610, Providence, Rhode
	Island 02903 (the “Company”), and <b>Marcus L. Delacroix</b>, an individual residing at 47 Winter
	Hill Road, Cranston, Rhode Island 02910 (the “Contractor”).
</p>

<h2>1. Engagement and Services</h2>
<ol class="clauses">
	<li>The Company engages the Contractor to provide data engineering and reporting services as
		described in Exhibit A. The Contractor shall devote such time as is reasonably required and is
		expected to be available during the Company’s ordinary business hours, Monday through Friday.</li>
	<li>The Contractor shall report to the Company’s Director of Analytics, shall attend the daily
		team stand-up at 9:15 a.m., and shall follow the Company’s written procedures for code review,
		ticket handling and release approval.</li>
	<li>The Contractor shall use the Company’s laptop, credentials and analytics platform, which the
		Company shall provide and maintain. The Contractor shall not use subcontractors without the
		Company’s prior written consent.</li>
	<li>The Contractor shall work primarily from a home office and shall attend the Providence
		office on the first Tuesday of each month.</li>
</ol>

<h2>2. Status of the Parties</h2>
<ol class="clauses">
	<li>The Contractor is engaged as an independent contractor and not as an employee, partner
		or agent of the Company. Nothing in this Agreement creates an employment relationship.</li>
	<li>The Company shall report amounts paid under this Agreement on Form 1099-NEC. The Company
		shall not withhold federal, state or local income tax, and shall not withhold or pay
		employment taxes on the Contractor’s behalf. The Contractor is responsible for self-employment
		tax and for any estimated payments.</li>
	<li>The Contractor is not eligible for the Company’s health plan, paid leave, 401(k) or any
		other employee benefit plan, and waives any claim to such benefits arising from the
		services performed under this Agreement.</li>
	<li>The parties agree that the classification stated in this Section is conclusive between them.</li>
</ol>

<h2>3. Compensation and Expenses</h2>
<ol class="clauses">
	<li>The Company shall pay the Contractor <b>$96.00 per hour</b>, invoiced monthly in arrears and
		payable within fifteen (15) days of receipt of an invoice.</li>
	<li>Approved travel expenses shall be reimbursed. Local travel is reimbursed at the standard
		mileage rate; overnight travel is reimbursed on a per diem basis
		without receipts for meals and incidentals.</li>
	<li>The Company shall reimburse the Contractor $150.00 per month toward the cost of the home
		office described in Clause 1.4.</li>
	<li>Reimbursements are not reported as compensation and no reporting is required in respect
		of amounts reimbursed under this Section.</li>
</ol>

<h2>4. Term, Termination and Exclusivity</h2>
<ol class="clauses">
	<li>This Agreement commences on the Effective Date and continues until terminated. Either party
		may terminate on fourteen (14) days’ written notice; the Company may terminate immediately for
		cause.</li>
	<li>During the term the Contractor shall not provide services to any competitor of the Company
		without the Company’s prior written consent, and shall not solicit the Company’s clients or
		personnel for twelve (12) months following termination.</li>
</ol>

<h2>5. Confidentiality and Work Product</h2>
<ol class="clauses">
	<li>The Contractor shall keep the Company’s confidential information in confidence during and
		after the term.</li>
	<li>All work product created in the course of the services is a work made for hire and is the
		exclusive property of the Company. To the extent any work product does not so vest, the
		Contractor assigns it to the Company.</li>
</ol>

<h2>6. General</h2>
<ol class="clauses">
	<li>This Agreement is governed by the laws of the State of Rhode Island.</li>
	<li>This Agreement, with Exhibit A, is the entire agreement between the parties and supersedes all
		prior discussions.</li>
</ol>

<div class="sign">
	<div>
		<div class="rule"></div>
		<div class="cap">Northbridge Analytics, Inc.<br />By: Helen A. Ortiz, Chief Operating Officer</div>
	</div>
	<div>
		<div class="rule"></div>
		<div class="cap">Marcus L. Delacroix, Contractor</div>
	</div>
</div>
`;

// ----------------------------------------------------------------- engagement

const engagement = `
<h1>Tax Services Engagement Letter</h1>
<p class="sub">Halloran &amp; Voss CPAs LLC · 88 Chestnut Avenue, Suite 400 · Columbus, Ohio 43215</p>

<p>January 12, 2026</p>

<p class="parties">
	Ms. Adaeze Okonkwo<br />
	President, Brightline Fabrication LLC<br />
	615 Tinsmith Road, Grove City, Ohio 43123
</p>

<p>Dear Ms. Okonkwo,</p>

<p>
	Thank you for asking us to continue as your firm’s accountants. This letter sets out the services
	we will provide for the year ending December 31, 2026, what we will need from you, and the basis
	on which we will bill.
</p>

<h2>1. Scope of Services</h2>
<ol class="clauses">
	<li>We will prepare the federal and Ohio income tax returns of Brightline Fabrication LLC for the
		year ending December 31, 2026, together with the related Schedules K-1 for the members.</li>
	<li>We will prepare the individual federal and state returns for you and Mr. Okonkwo for the same
		year.</li>
	<li>We will advise on the research credit position described in Section 3 below and will
		assist in assembling the supporting documentation for qualified research expenses.</li>
	<li>We will review the members’ reasonable compensation for the year and advise on
		adjustments before the final payroll run.</li>
	<li>Our engagement does not include an audit, review or compilation of financial statements, and
		we will not express an opinion or any form of assurance on them. We will not examine or verify
		the underlying records, and this engagement cannot be relied upon to disclose errors, fraud or
		other illegal acts.</li>
</ol>

<h2>2. Your Responsibilities</h2>
<ol class="clauses">
	<li>You are responsible for the completeness and accuracy of the records and information you
		provide, and for maintaining documentation to support the amounts reported.</li>
	<li>You are responsible for substantiating travel expenses and business meals. We
		will accept the summary schedules you provide; the firm has advised previously that meals with
		customers at trade shows are fully deductible, and we will continue on that basis unless
		you tell us otherwise.</li>
	<li>You confirm that the company holds no foreign bank accounts and no interest in any
		offshore entity. If that changes you will tell us promptly.</li>
</ol>

<h2>3. Research Credit</h2>
<ol class="clauses">
	<li>Based on our review of the 2025 engineering time records, we consider the company’s process
		development work supports a claim. Our view is that the position is
		more likely than not to be sustained and that there is substantial authority for
		it, which in our opinion provides penalty protection if the claim is examined.</li>
	<li>We guarantee that the credit as computed will withstand examination, and should the
		Internal Revenue Service take a different view we will represent the company at no additional
		charge.</li>
	<li>Amounts reimbursed to engineering staff for prototype materials are treated as accountable
		plan reimbursements and do not need to be reported on the employees’ Forms W-2.</li>
</ol>

<h2>4. Fees and Billing</h2>
<ol class="clauses">
	<li>Our fee for the services in Section 1 is estimated at $14,500, billed monthly as work
		progresses. The research credit work in Section 3 is billed additionally at 15% of the credit
		ultimately claimed.</li>
	<li>Invoices are payable on receipt. Balances outstanding beyond 30 days carry interest at 1% per
		month.</li>
</ol>

<h2>5. Other Terms</h2>
<ol class="clauses">
	<li>Our working papers remain our property. We will retain the engagement file for seven years.</li>
	<li>Either party may terminate this engagement on written notice. Fees for work performed to the
		date of termination remain payable.</li>
	<li>This engagement letter will continue in effect for future years unless it is amended or
		terminated in writing.</li>
</ol>

<p>
	If this letter reflects your understanding, please sign below and return one copy. We are glad to
	be working with you again.
</p>

<div class="sign">
	<div>
		<div class="rule"></div>
		<div class="cap">Halloran &amp; Voss CPAs LLC<br />By: Gregory T. Voss, CPA, Partner</div>
	</div>
	<div>
		<div class="rule"></div>
		<div class="cap">Accepted — Brightline Fabrication LLC<br />By: Adaeze Okonkwo, President</div>
	</div>
</div>
`;

const DOCUMENTS = [
	{ file: 'residential-lease-1420-maple.pdf', title: 'Residential Lease Agreement', body: lease },
	{
		file: 'contractor-agreement-northbridge.pdf',
		title: 'Independent Contractor Services Agreement',
		body: contractor
	},
	{
		file: 'engagement-letter-brightline.pdf',
		title: 'Tax Services Engagement Letter',
		body: engagement
	}
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();

for (const { file, title, body } of DOCUMENTS) {
	await page.setContent(
		`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${STYLE}</style></head><body>${body}</body></html>`,
		{ waitUntil: 'load' }
	);
	const pdf = await page.pdf({
		format: 'Letter',
		printBackground: true,
		displayHeaderFooter: true,
		headerTemplate: HEADER,
		footerTemplate: FOOTER,
		margin: { top: '0.75in', bottom: '0.85in', left: '0.85in', right: '0.85in' }
	});
	await writeFile(join(outDir, file), pdf);
	console.log(`wrote ${file} (${(pdf.length / 1024).toFixed(0)} KB)`);
}

await browser.close();
