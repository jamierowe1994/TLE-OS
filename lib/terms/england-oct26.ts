/**
 * THE ENGLAND TERMS OF BUSINESS, OCTOBER 2026 (TLE_TOB_England_Oct26.pdf).
 *
 * Written down as data in the contract's own order and numbering: the
 * Agreement Details, the Core Definitions, clauses 1 to 29, the signatures,
 * the request to start during the cooling-off period and the model
 * cancellation form. It is the England twin of lib/terms/scotland-oct26 and
 * replaces the Sep 26 DocuSeal template for anything sent from a home's
 * Compliance tab (James, 23 Oct 2026: "we just need the same process that
 * you've already built").
 *
 * Kept as printed except where the page is not paper, the same as Scotland:
 *  - em dashes are hyphens (house rule for anything a customer reads);
 *  - "refer to the Agreement Details on page 2" reads "above", as there are no pages;
 *  - "Whats included" has its apostrophe;
 *  - headings are in Title Case rather than capitals.
 *
 * England has no landlord or agent registration yet (the PRS Database opens
 * from 15 December 2026, per the definitions), so there is no Registration
 * section and the landlord is asked only about themselves. No bank details
 * either: this edition prints none.
 */

import type { TermsDoc } from "@/lib/terms/types";

const YES = "Yes";

export const ENGLAND_OCT26: TermsDoc = {
  id: "england-oct26",
  country: "england",
  title: "Landlord Agency Agreement & Terms of Business",
  subtitle: "England",
  edition: "October 2026",
  details: [
    { key: "name", label: "Full name", required: true, step: "you" },
    { key: "email", label: "Email address", required: true, kind: "email", step: "you" },
    { key: "phone", label: "Contact number", required: true, kind: "tel", step: "you" },
    { key: "address", label: "Home address", hint: "Your home address, not the property's", required: true, step: "you" },
  ],
  sections: [
    {
      title: "Agreement Details",
      blocks: [
        { kind: "p", text: "The following details have been confirmed via the Landlord Portal and the appointed Agent. This Agreement is issued on the basis of the information and selections recorded below." },
        {
          kind: "facts",
          rows: [
            { label: "Partner Agent", value: "{{agentName}}" },
            { label: "Property Address", value: "{{propertyAddress}}" },
          ],
        },
        { kind: "p", text: "<em>Together with any common ways or shared facilities of which the Property forms a part, and fixtures, fittings and furniture belonging to the Landlord.</em>" },
        { kind: "landlords", fields: ["name", "address", "phone", "email"] },
      ],
    },
    {
      title: "Service and Fees",
      blocks: [{ kind: "fees" }],
    },
    {
      title: "Core Definitions",
      blocks: [
        { kind: "p", text: "The following key definitions apply throughout this Agreement and reflect the legislative framework governing residential lettings in England, including the Renters' Rights Act 2025." },
        {
          kind: "list",
          items: [
            "<strong>Periodic Tenancy</strong> - A tenancy with no fixed end date that runs on a rolling basis. All tenancies granted under this Agreement will be periodic. Fixed-term tenancies are no longer permitted under current legislation.",
            "<strong>Possession</strong> - The legal process by which a Landlord may recover their Property. Possession may only be sought on prescribed statutory grounds. “No fault” possession is no longer available. Each ground carries specific conditions, notice requirements and minimum tenancy periods that must be satisfied before a notice may be served.",
            "<strong>Rent Review</strong> - A rent increase may only be implemented using the prescribed statutory notice procedure. The Tenant has the right to refer any proposed increase to the First-tier Tribunal for independent determination, which may set a rent below the level proposed or currently payable.",
            "<strong>Sale of Property</strong> - A sale does not automatically end a tenancy. Vacant possession may only be sought using the relevant statutory ground for sale, subject to conditions including a genuine intention to sell and the tenancy having been in place for the minimum period required by law.",
            "<strong>Pet Request</strong> - Tenants have a statutory right to request permission to keep a pet. A Landlord may not unreasonably refuse such a request, and any refusal must be on reasonable grounds. Where a pet is permitted, the Landlord may retain funds from the Tenancy Deposit to cover any damage caused.",
            "<strong>Holding Deposit</strong> - A payment taken to reserve a property whilst referencing is completed. The maximum amount, permitted deductions and timeframes are prescribed by current legislation. No other pre-tenancy payment may be taken.",
            "<strong>Tenancy Deposit</strong> - A payment held as security against damage or unpaid rent. The maximum amount, protection requirements and prescribed information rules are governed by current legislation. A deposit replacement product may be offered as an alternative.",
            "<strong>Awaab’s Law</strong> - Awaab’s Law currently applies to the social housing sector only, requiring landlords to investigate and remedy damp and mould within prescribed timeframes. The government has confirmed its intention to extend equivalent obligations to the private rented sector in due course, subject to further consultation. No implementation date for the private rented sector has been set. In the meantime, Landlords must address damp, mould and other hazards promptly under their existing obligations under the Housing Health and Safety Rating System (HHSRS). The Landlord agrees to respond without delay to any such reports from the Tenant or the Agent.",
            "<strong>PRS Database</strong> - From 15 December 2026, all private landlords in England will be required to register themselves and each rental property on the government’s national Private Rented Sector Database before marketing or letting. Registration is rolling out region by region, with landlords having three months to register once their region opens. The annual registration fee is £65 per property, renewed each year. Landlords and property advertisements must include the Landlord Registration Number and Property Registration Number once registration is in force for their region. Registration is the Landlord’s sole responsibility. Current regional registration dates and guidance are available at www.gov.uk/guidance/register-your-rental-property.",
            "<strong>Landlord Redress Scheme</strong> - All private landlords will be required to belong to the government’s new Private Rented Sector Landlord Ombudsman scheme. This requirement is not yet in force and the Ombudsman is not expected to be operational until 2028. The Agent will notify all Landlords when membership becomes mandatory and will provide guidance on how to join.",
          ],
        },
        { kind: "p", text: "All definitions should be read alongside the relevant clauses in this Agreement." },
      ],
    },
    {
      n: "1",
      title: "Terms and Conditions",
      blocks: [
        { kind: "p", text: "This Agreement sets out the terms upon which the Property will be marketed, let and/or managed under The Letting Experts network. For the purposes of this Agreement, “the Agent” means The Letting Experts, who may deliver the services selected under this Agreement through an Approved Authorised Representative Partner Agent operating within The Letting Experts network and named in the Agreement Details above." },
        { kind: "p", text: "The Landlord appoints the Agent to market, let and/or manage the Property in accordance with the service level selected. This contract details the obligations of each party and becomes legally binding once signed and dated by the parties to it. Please read this document carefully and request an explanation of anything you do not understand before signing it. The information provided will be used in the preparation of the tenancy agreement and other legal documentation relating to the Property." },
        { kind: "h", text: "Nature of Tenancy" },
        { kind: "p", text: "All tenancies granted will be periodic tenancies in accordance with current legislation. Fixed-term tenancies will not be used unless specifically permitted by law. The Landlord acknowledges that tenants will have the right to occupy the Property on a rolling periodic basis and may end the tenancy in accordance with statutory notice provisions." },
      ],
    },
    {
      n: "2",
      title: "Agreement & Declaration",
      blocks: [
        { kind: "p", text: "The terms of this Agreement constitute a binding legal contract. If you are unsure of your obligations under this Agreement, you are advised to seek independent legal advice before signing. By signing this Agreement, you confirm:" },
        {
          kind: "list",
          items: [
            "You are the sole or joint owner(s) of the Property, or have the legal right to authorise the letting of this Property.",
            "You have sought permission from your mortgage lender (if any) to let the Property.",
            "You have advised your insurers of your intention to let the Property and hold appropriate buildings and contents insurance specific to a tenanted property.",
            "Any service charge or ground rent payments are up to date, and you have permission to let from any freeholder. Any restrictions or conditions within any lease agreement will be fulfilled under the terms of the tenancy agreement.",
            "The Property complies with all statutory requirements applicable to residential lettings in England at the time of letting, and you will maintain such compliance throughout the tenancy. You acknowledge that legislative requirements may change and agree to ensure ongoing compliance with all applicable obligations as they come into force.",
            "You have read and understood the Terms and Conditions set out in this Agreement and confirm that The Letting Experts may proceed with the letting and management (if applicable) of your Property.",
            "You agree to be bound by the terms of this Agreement and to pay all fees as appropriate.",
          ],
        },
        { kind: "h", text: "Rent and Marketing Agreement" },
        { kind: "p", text: "The Property will be marketed at a fixed asking rent. The Agent will not invite, accept or facilitate offers above the advertised rent. The agreed rent will not exceed the advertised rent unless subsequently reduced by agreement between the Landlord and Tenant in accordance with applicable legislation." },
        { kind: "h", text: "Non-Discrimination" },
        { kind: "p", text: "The Landlord agrees not to instruct the Agent to discriminate against prospective or existing tenants on the basis of children, receipt of benefits, pet ownership, or any other protected characteristic under applicable legislation. The Landlord acknowledges that tenants have a statutory right to request permission to keep a pet at the Property, and that any refusal must be on reasonable grounds and communicated in accordance with current legislation. The Agent reserves the right to refuse to act on any instruction that would breach equality, housing, or consumer protection legislation." },
      ],
    },
    {
      n: "3",
      title: "Service Level",
      blocks: [
        { kind: "p", text: "Having appointed The Letting Experts as Agent upon signing this Agreement, the Agent will provide the following services:" },
        { kind: "h", text: "Tenant Find Only (Non-Managed)" },
        {
          kind: "list",
          items: [
            "Provide a rental valuation and advise the Landlord on relevant matters affecting the letting of the Property, including any action required to make the Property suitable for letting.",
            "Erect a “To Let” board at the Property where considered appropriate by the Agent, unless otherwise instructed in writing by the Landlord.",
            "Market and promote the Property to identify a suitable Tenant.",
            "Arrange and conduct accompanied viewings with prospective Tenants.",
            "Obtain references and/or credit checks for prospective Tenant(s) and provide the results together with the Agent's professional advice. The Landlord will be consulted on the selection of a Tenant; however, the Agent reserves the right to decline any application that does not meet its referencing or compliance criteria.",
            "Prepare the appropriate form of tenancy agreement in line with current legislation and serve any statutory notices and prescribed information required at the commencement of the tenancy.",
            "Collect the first month's rent and security deposit (where applicable).",
            "Following receipt of cleared funds, deduct agreed fees and remit the balance to the Landlord via BACS transfer within three working days, unless otherwise agreed in writing.",
          ],
        },
        { kind: "h", text: "Rent Collection (in addition to Tenant Find)" },
        { kind: "list", items: ["Demand and collect rent from the Tenant(s) and remit the same to the Landlord, less agreed fees, following receipt of cleared funds, together with a rental statement."] },
        { kind: "h", text: "Letting & Management (Managed)" },
        { kind: "p", text: "In addition to the above, the following services will also be included:" },
        {
          kind: "list",
          items: [
            "Arrange for the Property to be cleaned before letting, where reasonably necessary, up to a limit of £200 inclusive of VAT, payable by the Landlord.",
            "Provide the Tenant(s) with access to the Property at commencement of the tenancy, including keys, fobs, access codes and parking permits (subject to such items being supplied by the Landlord).",
            "Set up a monthly standing order or other agreed payment method for rent payable by the Tenant(s) to the Agent.",
            "Protect the tenancy deposit and serve prescribed information in accordance with the Tenancy Deposit Scheme and applicable legislation, as detailed in Clause 16 (Deposits).",
            "Demand and collect rent and remit the same to the Landlord, less agreed fees and authorised deductions, following receipt of cleared funds. Payments will be made via bank transfer and accompanied by a rental statement.",
            "Where not supplied by the Landlord, arrange statutory compliance documentation in accordance with Clause 9 (Safety & Compliance).",
            "Provide meter readings to relevant utility providers and the local authority at the commencement of the tenancy. The Agent may introduce the Tenant(s) to Helpthemove to assist with utility transfers and void management services.",
            "Arrange a professional Inventory and Check-In Report (costs to be quoted and payable by the Landlord), subject to the Landlord providing access to the Property and meters.",
            "Conduct periodic inspections (normally every six months) and report to the Landlord on the condition of the Property (may be subject to an extra charge).",
            "Liaise with the Landlord and Tenant(s) regarding tenancy continuation, rent reviews and statutory notices, in accordance with applicable legislation.",
            "Carry out managing agent duties in relation to repairs and statutory obligations on behalf of the Landlord in accordance with Clause 8 (Repairs and Statutory Obligations - Management Service).",
            "Coordinate maintenance and refurbishment works in accordance with Clauses 8 and 10, respectively.",
            "At the end of the tenancy, arrange key collection, conduct a check-out inspection (costs to be quoted and payable by the Landlord), compare findings against the inventory and prepare a schedule of dilapidations where applicable.",
            "Administer the return of the tenancy deposit in accordance with the relevant deposit scheme rules, including handling proposed deductions and any dispute resolution process.",
            "Provide Rent & Legal Protection cover where included within the Experts Managed Service, subject to the policy terms and conditions (Clause 22, Insurance).",
          ],
        },
      ],
    },
    {
      title: "Service Levels",
      blocks: [
        { kind: "p", text: "What's included at each service level, and the standard fees that apply." },
        {
          kind: "table",
          head: ["What's included", "Tenant Find", "Rent Collection", "Experts Management Service (most popular)"],
          rows: [
            ["Market Appraisal", YES, YES, YES],
            ["Preparation of property details & photographs*", YES, YES, YES],
            ["Erect a ‘To Let’ Board", YES, YES, YES],
            ["Promote property on Rightmove, Zoopla, On the Market", YES, YES, YES],
            ["Accompanied viewings", YES, YES, YES],
            ["Comprehensive tenant referencing", YES, YES, YES],
            ["Tenancy Agreement", YES, YES, YES],
            ["Rent collection & statements", "", YES, YES],
            ["Deposit protected in government approved deposit scheme/Flatfair Deposit Replacement", "", "", YES],
            ["Professional Inventory/schedule of condition & check-in**", "", "", YES],
            ["Rent Reviews", "", "", YES],
            ["Repairs & maintenance co-ordination", "", "", YES],
            ["Property inspections every 6 months**", "", "", YES],
            ["Co-ordination of annual Gas Safety & Electrical safety checks", "", "", YES],
            ["Check out inspection & deposit resolution**", "", "", YES],
            ["Rent & legal Insurance", "", "", YES],
            [
              "<strong>Fee</strong>",
              "<strong>75%</strong> of 1st Month Rent + VAT",
              "<strong>12% + VAT</strong> (14.4% inc VAT) + 50% 1st Month Rent + VAT set-up fee",
              "<strong>14% + VAT</strong> (16.8% inc VAT) + 50% 1st Month Rent + VAT set-up fee",
            ],
          ],
        },
        { kind: "p", text: "<strong>Min fee £500+VAT</strong>" },
        { kind: "p", text: "<em>*Standard Marketing included - additional services can be provided at an extra cost</em>" },
        { kind: "p", text: "<em>**Additional fee may apply - refer to the Agreement Details above</em>" },
      ],
    },
    {
      n: "4",
      title: "Confirmation of Instructions",
      blocks: [
        { kind: "p", text: "The Landlord agrees that all material instructions to the Agent, including but not limited to termination of this Agreement, service of statutory notices, commencement of possession proceedings, approval of major repairs, withdrawal of the Property from the market or any other significant decision relating to the letting or management of the Property, shall be provided in writing (including by email or via the Landlord Portal). The Agent shall be entitled to rely upon written instructions received from the Landlord and shall not be liable for any loss arising from acting in accordance with such instructions. The Agent shall not be responsible for acting upon verbal instructions unless subsequently confirmed in writing." },
      ],
    },
    {
      n: "5",
      title: "Compliance and Record Keeping",
      blocks: [
        { kind: "p", text: "The Agent will maintain appropriate records and documentation to evidence compliance with all applicable legal and regulatory obligations. The Landlord agrees to provide all information and documentation reasonably required to enable the Agent to meet such obligations and acknowledges that failure to do so may impact the Agent's ability to act." },
      ],
    },
    {
      n: "6",
      title: "Incorrect Information",
      blocks: [
        { kind: "p", text: "The Landlord warrants that all information provided to the Agent in connection with the Property and this Agreement, including via the Landlord Portal, is accurate and complete to the best of their knowledge and belief. The Landlord acknowledges that the Agent will rely upon such information when marketing the Property, preparing tenancy documentation and carrying out management services. The Landlord agrees to indemnify and keep indemnified the Agent against any losses, claims, liabilities, costs, penalties or expenses (including legal costs) arising as a result of inaccurate, incomplete or misleading information supplied by the Landlord. The Agent shall not be liable for any loss or claim arising from reliance upon information provided by the Landlord." },
      ],
    },
    {
      n: "7",
      title: "Statutory Obligations of the Landlord When Letting Residential Property",
      blocks: [
        { kind: "p", text: "The Landlord acknowledges that legislative requirements may change during the term of the tenancy and agrees to comply with all such changes as they come into force. The Landlord agrees to provide all information required to ensure compliance with legal and regulatory obligations, including property and tenancy-related data. The Landlord agrees to comply with all applicable laws, regulations and statutory requirements relating to the letting of residential property, including but not limited to safety, licensing, housing standards, consumer protection and taxation legislation. The Landlord warrants that the Property, including any fixtures, fittings and furnishings supplied, complies with all relevant statutory requirements in force at the commencement of and throughout the tenancy, including the Furniture and Furnishings (Fire) (Safety) Regulations 1988 (as amended), the Gas Safety (Installation and Use) Regulations 1998, the Electrical Safety Standards in the Private Rented Sector (England) Regulations 2020 and all other applicable legislation as amended from time to time. The Agent shall not be liable for any loss arising from the Landlord's failure to comply with such statutory obligations." },
      ],
    },
    {
      n: "8",
      title: "Repairs and Statutory Obligations - Management Service",
      blocks: [
        { kind: "p", text: "The Landlord is responsible for maintaining the Property in accordance with Section 11 of the Landlord and Tenant Act 1985 and all other applicable statutory obligations relating to repair, safety and housing standards. The Landlord acknowledges that failure to carry out repairs within a reasonable timeframe may result in enforcement action or restrictions on possession and agrees to act promptly on all repair requests. The Landlord also acknowledges that failure to maintain the Property may result in injury, damage, enforcement action or claims and agrees to indemnify the Agent against any loss arising from the Landlord's failure to comply with such obligations." },
        { kind: "p", text: "Where a managed service is provided, the Agent is authorised to arrange and coordinate routine repairs and maintenance to the Property and its contents, including instructing contractors, obtaining quotations where appropriate, supervising works and settling contractor invoices from rental income received. The Agent may instruct works up to £500 (inclusive of VAT) per individual repair without prior reference to the Landlord where reasonably necessary for the proper management, safety or preservation of the Property. Wherever practicable, the Agent will notify the Landlord of works instructed under this authority. For works exceeding £500 (inclusive of VAT), the Agent will obtain the Landlord's approval prior to instruction (except in emergencies)." },
        { kind: "p", text: "In cases of emergency, or where works are required to comply with statutory obligations, protect the Property or ensure tenant safety, the Agent may authorise works without prior approval and incur such expenditure as is reasonably necessary. Where any individual repair or project exceeds £1,000 (inclusive of VAT), a project management fee of 15% plus VAT will be charged on the total cost of the works. This fee covers contractor coordination, administration and compliance oversight, and may be deducted from rental income or invoiced separately. The Landlord shall provide details of any applicable warranties or guarantees relating to appliances or systems at the Property. The Agent shall not be liable for works outside warranty cover due to incomplete Landlord information, nor for non-payment of Council Tax, rates or utility charges." },
      ],
    },
    {
      n: "9",
      title: "Safety & Compliance",
      blocks: [
        { kind: "p", text: "The Landlord is responsible for ensuring the Property complies with all applicable statutory obligations relating to residential letting at all times. The Agent may assist where instructed or where a managed service is selected; however, ultimate legal responsibility remains with the Landlord. The Landlord acknowledges that property standards may change and agrees to ensure ongoing compliance with all applicable requirements. The Landlord agrees to respond promptly to any repair, safety or compliance requirement to avoid enforcement action." },
        { kind: "h", text: "EPC (Energy Performance Certificate)" },
        { kind: "p", text: "<strong>£90 inc VAT</strong>" },
        { kind: "p", text: "An Energy Performance Certificate (EPC) provides an energy efficiency rating for a residential property and is required by law before the Property is marketed for letting. The Landlord must ensure that a valid EPC is in place and meets the minimum legal requirements prior to marketing and throughout the tenancy. Where a valid EPC is not supplied by the Landlord, the Agent is authorised to arrange one to ensure compliance prior to marketing or letting. From 1 October 2030, the minimum EPC rating for privately rented properties in England will rise from E to C. Landlords are advised to begin planning for this requirement now." },
        { kind: "h", text: "Gas Safety Certificate" },
        { kind: "p", text: "<strong>£90 inc VAT</strong>" },
        { kind: "p", text: "In accordance with the Gas Safety (Installation and Use) Regulations 1998, all gas appliances, pipework and flues must be inspected annually by a Gas Safe registered engineer. A valid Gas Safety Record must be provided to the Tenant before occupation, and a copy provided within 28 days of each subsequent inspection. Where a valid certificate is not supplied by the Landlord, the Agent is authorised to arrange one to ensure compliance prior to marketing or letting." },
        { kind: "h", text: "EICR & PAT" },
        { kind: "p", text: "<strong>EICR from £170 inc VAT, PAT £80 inc VAT</strong>" },
        { kind: "p", text: "In accordance with the Electrical Safety Standards in the Private Rented Sector (England) Regulations 2020, the Landlord must ensure that an EICR (Electrical Installation Condition Report) is carried out at intervals of no more than five years, or sooner where specified within the report. Any remedial works identified must be completed within 28 days or such shorter period as specified. A copy must be provided to new Tenants before occupation and to existing Tenants within 28 days of inspection. Portable Appliance Testing (PAT) is not a statutory requirement but is recommended annually where electrical appliances are supplied. Where a valid EICR is not supplied by the Landlord, the Agent is authorised to arrange one to ensure compliance." },
        { kind: "h", text: "Smoke & CO Alarms" },
        { kind: "p", text: "<strong>£50 inc VAT per alarm</strong>" },
        { kind: "p", text: "In accordance with the Smoke and Carbon Monoxide Alarm (England) Regulations 2015 (as amended 2022), the Landlord must ensure at least one smoke alarm is installed on every storey used wholly or partly as living accommodation, and a carbon monoxide alarm in any room with a fixed combustion appliance (excluding gas cookers). All alarms must be in proper working order at the start of each new tenancy. Where alarms are not supplied by the Landlord, the Agent is authorised to arrange them to ensure compliance." },
        { kind: "h", text: "Legionella Risk Assessment (ACOP L8)" },
        { kind: "p", text: "<strong>Available on request</strong>" },
        { kind: "p", text: "In accordance with current HSE guidance and the Approved Code of Practice L8, the Landlord is responsible for assessing and managing the risk of exposure to Legionella at the Property. In most domestic rental properties the risk is low and a simple assessment may be carried out by the Landlord if competent to do so; otherwise a suitably qualified person should be instructed. The Agent can arrange an assessment on the Landlord's behalf for an additional fee." },
        { kind: "h", text: "Inventory & Check-In (Furniture & Furnishings)" },
        { kind: "p", text: "<strong>Included in Experts Management, available on request otherwise</strong>" },
        { kind: "p", text: "In accordance with the Furniture and Furnishings (Fire)(Safety) Regulations 1988 (as amended), all upholstered furniture and furnishings supplied must comply with the required fire resistance standards. The Agent strongly recommends a professional Inventory and Schedule of Condition be prepared at the commencement of the tenancy to assist in the resolution of any future deposit disputes. Where the Landlord declines to commission a professional inventory, the Agent shall not be responsible for any loss arising from the inability to evidence the condition of the Property at the start of the tenancy." },
      ],
    },
    {
      n: "10",
      title: "Property Refurbishment Service",
      blocks: [
        { kind: "p", text: "Where separately instructed, the Agent may provide a Property Refurbishment Service for planned or improvement works beyond routine maintenance. This service includes obtaining quotations, liaising with contractors (whether selected by the Agent or the Landlord), coordinating works and overseeing the project through to completion. A project management fee of 15% plus VAT will be charged on the total cost of refurbishment works (including labour and materials), payable upon completion and may be deducted from rental income or invoiced separately where insufficient funds are held. This clause applies to planned refurbishment or improvement projects and is separate from routine maintenance works covered under Clause 8." },
      ],
    },
    {
      n: "11",
      title: "Tenancy Continuation & Rent Reviews",
      blocks: [
        { kind: "p", text: "All tenancies will continue as statutory periodic tenancies in accordance with applicable legislation. No renewal agreement is required or will be used. Rent reviews will be conducted in accordance with the statutory process under Section 13 of the Housing Act 1988, as amended. The Agent will advise the Landlord on an appropriate rental figure based on current market conditions and comparable evidence; however, any rent increase must be implemented using the statutory notice procedure and cannot exceed the market rate. The Landlord acknowledges that the Tenant has the right to refer any proposed rent increase to the First-tier Tribunal for determination, and that the Tribunal may set a rent below the level proposed or currently payable. The Agent will manage this process on the Landlord's behalf where a managed service has been selected." },
      ],
    },
    {
      n: "12",
      title: "Possession",
      blocks: [
        { kind: "p", text: "The Landlord acknowledges that “no fault” possession procedures are no longer available. Possession of the Property may only be sought using statutory grounds as defined by current legislation. The Agent shall not be liable for any inability to obtain possession where the required legal grounds are not satisfied as defined by current legislation from time to time." },
        { kind: "h", text: "Possession Notice Service" },
        { kind: "p", text: "The Letting Experts offer a Possession Notice Service in partnership with Legal for Landlords Legal Services, whereby a specialist legal team will review all relevant documentation and issue the Section 8 Notice and any relevant supporting notices on the Landlord’s behalf. This service is designed to ensure that all documentation is accurate and complete before proceedings commence, which is essential should a court order subsequently be required. The minimum notice period varies depending on the ground relied upon, from four weeks up to four months, and the Agent will advise the Landlord on the applicable notice period for their circumstances. The fee for this service is £250 plus VAT. All court applications, hearings and enforcement proceedings remain the Landlord’s responsibility and will be subject to additional costs. The Landlord is advised to obtain independent legal advice before commencing possession proceedings. Where the Landlord has selected the Experts Management Service, Rent and Legal Protection Insurance is included, which provides cover for legal expenses and court costs associated with possession proceedings - full details are set out in Clause 22 (Insurance). The Agent accepts no liability for any outcome arising from incomplete or inaccurate information provided by the Landlord." },
      ],
    },
    {
      n: "13",
      title: "Annual Rental Statement",
      blocks: [
        { kind: "p", text: "The Agent can provide the Landlord with an Annual Statement detailing all rental payments, charges and expenses from the Landlord's property account, which can be used to support tax returns. The fee for this service is £60 inclusive of VAT." },
      ],
    },
    {
      n: "14",
      title: "Parking",
      blocks: [
        { kind: "p", text: "Where the Property has an allocated parking space/s, the Landlord will be responsible for notifying the Agent of the relevant details of the parking space/s number and location. The Landlord indemnifies the Agent from any cost, claims, payments and expenses that arise from supplying incorrect information." },
      ],
    },
    {
      n: "15",
      title: "Tenant Find Service",
      blocks: [
        { kind: "p", text: "Where the Landlord opts for the Tenant Find (Letting Only) Service and does not instruct the Agent as their Managing Agent, it is the Landlord's responsibility to carry out any maintenance and repairs to the Property and comply with all statutory requirements. The Landlord indemnifies the Agent from and against all costs, claims, damages and expenses arising because of the Landlord's negligence or failure to comply with their obligations and statutory requirements." },
        { kind: "p", text: "As part of The Letting Experts Tenant Find and Rent Collection Services, the Agent will receive the deposit from the Tenant, administer the required documentation and register the deposit with the Tenancy Deposit Scheme or the Flatfair Deposit Replacement Product (Clause 16). As the Agent will not be involved in the end-of-tenancy procedure or deposit resolution under this service, the Agent will rely on the Landlord's written instructions along with the Tenant's written confirmation to return the appropriate monies to each party. Alternatively, the deposit can be transferred to the Landlord's own designated Deposit Scheme, subject to the Agent receiving full details and membership number in advance of the tenancy negotiations. The Landlord agrees to inform the Tenant how and where their deposit is being held in accordance with the Housing Act 2004." },
      ],
    },
    {
      n: "16",
      title: "Deposits",
      blocks: [
        { kind: "h", text: "Tenancy Deposit Protection Scheme" },
        { kind: "p", text: "Where a tenancy deposit is taken in connection with a residential tenancy, the deposit shall be protected in accordance with the Housing Act 2004 and any applicable legislation within the required statutory time limits." },
        { kind: "h", text: "Full Management Service - included in Experts Management" },
        { kind: "p", text: "Where the Landlord has selected the Full Management Service, the Agent will register the deposit with the Tenancy Deposit Scheme (TDS) and serve the prescribed information on the Tenant and any relevant person within the required statutory timeframe. The Agent will administer the deposit throughout the tenancy and manage the release process at the end of the tenancy, including handling any proposed deductions or disputes in accordance with the scheme rules." },
        { kind: "h", text: "Tenant Find Service - £60 inc VAT to transfer" },
        { kind: "p", text: "Where the Landlord has selected a Tenant Find service only, the Landlord shall be responsible for protecting the deposit in a government-authorised tenancy deposit scheme within the required statutory timeframe and for serving the prescribed information and associated documentation on the Tenant and any relevant person. If requested, the Agent may transfer the deposit to the Landlord's nominated scheme. The Agent accepts no liability for any failure by the Landlord to comply with statutory deposit protection requirements once the deposit has been transferred." },
        { kind: "h", text: "Deposit Replacement Product (Flatfair) - included in Experts Management" },
        { kind: "p", text: "As an alternative to a traditional cash deposit, Tenants may be offered the option to purchase a deposit replacement product provided by Flatfair Limited (“Flatfair”). Where a Tenant elects to use the Flatfair product, no cash deposit will be held or protected under a tenancy deposit scheme, and the Landlord agrees to be bound by Flatfair's own terms where the product is used. The Agent may receive a commission from Flatfair. The Landlord may opt out prior to marketing the Property." },
        { kind: "h", text: "Landlord-Managed Deposit Requirements" },
        { kind: "p", text: "Where the Landlord elects to protect the deposit independently, the Landlord shall provide written confirmation of deposit registration within 30 days of receipt, together with the protection certificate, scheme name and membership number, and evidence the prescribed information has been served. The Agent accepts no liability for any failure by the Landlord to comply, and reserves the right to withhold release of tenancy documentation or keys where required information has not been provided." },
      ],
    },
    {
      n: "17",
      title: "Non-UK Resident Landlord",
      blocks: [
        { kind: "p", text: "Where the Landlord's usual place of abode is outside the United Kingdom, the Landlord may be classified as a non-resident landlord for the purposes of the Income Tax Act 2007 and the Taxation of Income from Land (Non-residents) Regulations 1995. In such circumstances, the Agent is required by law to deduct income tax at the basic rate from rental income received and account for such tax to HM Revenue & Customs (HMRC), unless the Landlord has obtained approval from HMRC to receive rental income gross. The Landlord is responsible for applying to HMRC using the appropriate Non-Resident Landlord (NRL1) form and providing written confirmation of approval to the Agent. Until such approval is received, the Agent is authorised and obliged to deduct tax in accordance with statutory requirements. When completing the NRL1 application form, the Landlord should use the Letting Experts reference number 904/NA066398. The Landlord confirms that they will notify the Agent of any changes to their UK residency status during the tenancy, and reasonable administration charges may apply for additional work undertaken in connection with tax reporting or correspondence relating to the Landlord's tax status." },
      ],
    },
    {
      n: "18",
      title: "Landlord Licensing and Houses in Multiple Occupation (HMO)",
      blocks: [
        { kind: "p", text: "The Landlord acknowledges that certain properties may require a licence under mandatory, additional or selective licensing schemes operated by the relevant local authority. It is the Landlord's sole responsibility to determine whether the Property requires a licence and to obtain and maintain such licence prior to marketing and throughout the tenancy. Where the Property is or may be classified as a House in Multiple Occupation (HMO), the Landlord shall ensure that all licensing, planning, safety and management requirements are satisfied. The Landlord must provide the Agent with written confirmation of any applicable licence, together with copies of all relevant certificates and conditions, prior to marketing the Property and upon renewal or variation of any licence, and agrees to notify the Agent immediately of any change in licensing status. The Agent accepts no liability for any loss, penalty or enforcement action arising from the Landlord's failure to obtain or maintain the required licence." },
      ],
    },
    {
      n: "19",
      title: "Client Identification and Anti-Money Laundering",
      blocks: [
        { kind: "p", text: "The Agent is required to comply with applicable anti-money laundering legislation, including the Proceeds of Crime Act 2002 and the Money Laundering, Terrorist Financing and Transfer of Funds (Information on the Payer) Regulations 2017. The Landlord agrees to provide such identification documents and information as the Agent may reasonably require to verify identity, proof of address and ownership of the Property in order to satisfy statutory obligations. The Agent reserves the right to delay or decline to act where satisfactory identification is not provided, and may be required to make disclosures to relevant authorities where legally obligated to do so, without liability to the Landlord for any such disclosure." },
      ],
    },
    {
      n: "20",
      title: "Client's Money",
      blocks: [
        { kind: "p", text: "All client money received in connection with this Agreement shall be held in a designated client account operated by The Letting Experts, separate from the Company's own funds and managed in accordance with applicable client money handling rules. Client money is protected under the Propertymark Client Money Protection Scheme. Details of the scheme and the Agent's certificate are available upon request and on The Letting Experts website. Partner Agents operating within The Letting Experts network do not hold client money directly, and all rents, deposits and other client funds are processed through the approved client accounting systems operated by The Letting Experts. No interest will be paid to the Landlord on monies held in the client account." },
      ],
    },
    {
      n: "21",
      title: "Referencing, Rent in Advance & Rent Guarantor Products",
      blocks: [
        { kind: "p", text: "All prospective tenants will be subject to referencing and affordability checks in accordance with the Agent's standard procedures and any applicable pre-tenancy compliance checks. A tenancy will only proceed where the referencing criteria are satisfied or an acceptable guarantor is in place. The Agent reserves the right to decline any application that does not meet its referencing or compliance criteria." },
        { kind: "p", text: "Rent in advance must not be used as an alternative to meeting referencing or affordability requirements. The Agent will collect one month's rent simultaneously with the signing of the tenancy agreement and prior to key release. Rent may not be requested or accepted before the agreement has been signed by all parties, and no more than one month's rent may be collected in advance at any time. Where rent is paid in advance for a period exceeding one rental payment cycle, such sums shall be treated as rent and not as a tenancy deposit. Any advance rent received will be held in the client account and released to the Landlord in line with the agreed rental due dates." },
        { kind: "p", text: "The Landlord acknowledges that once a tenancy agreement has been signed by all parties a legally binding tenancy exists and that keys may not lawfully be withheld beyond the tenancy start date regardless of whether rent has been received. Any rent outstanding at the tenancy start date will be pursued through the statutory arrears process. The Agent accepts no liability for rent unpaid at move-in where simultaneous completion was not possible due to circumstances outside the Agent's control. The Agent may offer or introduce a rent guarantee or guarantor product provided by a third-party provider, subject to that provider's own terms and conditions, which does not replace the requirement for the Tenant to meet the Agent's referencing and affordability criteria." },
      ],
    },
    {
      n: "22",
      title: "Insurance",
      blocks: [
        { kind: "h", text: "Buildings and Contents Insurance" },
        { kind: "p", text: "The Landlord is responsible for ensuring that the Property is adequately insured for buildings and contents and that the policy provides appropriate cover while the Property is let to tenants. The Agent may introduce the Landlord to a specialist landlord insurance provider; however, the Landlord remains responsible for arranging and maintaining suitable insurance cover. The Agent accepts no liability for any uninsured loss." },
        { kind: "h", text: "Rent and Legal Protection Insurance" },
        { kind: "p", text: "Where the Landlord selects the Experts Management Service, the Agent will arrange a Rent and Legal Protection policy provided by LegalforLandlords (or an equivalent provider), subject to the tenancy meeting the insurer's acceptance criteria and policy conditions. Cover is provided strictly in accordance with the terms, conditions, exclusions and indemnity limits of the policy. The Agent does not warrant or guarantee that a claim will be accepted and shall not be liable for any refusal of cover or limitation of payment by the insurer. Full policy documentation will be provided separately to the Landlord." },
        { kind: "h", text: "What's Covered" },
        {
          kind: "list",
          items: [
            "Vacancy rent cover - full rent until vacant possession is obtained (12-month policies)",
            "Legal expenses cover of up to £100,000 for eviction, court fees and enforcement",
            "Rent payments starting within 30 days of claim acceptance",
            "Cover designed for Section 8 possession claims, including extended arrears periods",
            "Up to three months' post-possession rent",
            "Additional cover for tenant damage",
            "Eviction managed on the Landlord's behalf",
            "No gaps between insurance and legal cover",
            "Available for new or existing tenancies",
          ],
        },
        { kind: "p", text: "The Landlord agrees to be contacted by the Agent's insurance provider regarding all relevant insurance risks and gives consent for their contact details to be provided to them to discuss the policies and cover available." },
      ],
    },
    {
      n: "23",
      title: "Data Protection Act",
      blocks: [
        { kind: "p", text: "The Agent processes personal data in accordance with the Data Protection Act 2018 and UK GDPR. Personal information provided by the Landlord will be used for the purposes of administering this Agreement, complying with legal and regulatory obligations and managing the tenancy. The Agent may share relevant information with third parties where necessary for the performance of this Agreement or where required by law. Further details of how personal data is processed, including information regarding data subject rights, are set out in the Agent's Privacy Policy available on the Agent's website." },
      ],
    },
    {
      n: "24",
      title: "Compliance and Redress Scheme",
      blocks: [
        { kind: "p", text: "The Letting Experts Nationwide Ltd is a member of Property Redress and complies with the requirements of that scheme. If a complaint is not resolved through the Agent's internal complaints procedure, the Landlord may refer the matter to Property Redress in accordance with its rules. The Agent may disclose relevant information relating to the letting or management of the Property to Property Redress where required for the purposes of complaint investigation or regulatory compliance. Details of the Agent's Complaints Handling Procedure are available at www.thelettingexperts.co.uk/complaints-handling." },
      ],
    },
    {
      n: "25",
      title: "Changes to These Terms and Conditions",
      blocks: [
        { kind: "p", text: "The Letting Experts may amend these Terms and Conditions at any time without notice. They will be binding on all parties at the time of notification. If the amendments are due to statutory changes, they will take effect immediately upon notification." },
      ],
    },
    {
      n: "26",
      title: "Transfer of Service",
      blocks: [
        { kind: "p", text: "The Landlord acknowledges that this Agreement is with The Letting Experts Nationwide Ltd (“the Agent”), with services delivered by an authorised Partner Agent operating within The Letting Experts network. To ensure continuity of service, compliance, and the protection of all parties, the Agent reserves the right, at its sole discretion, to transfer the management or delivery of services relating to the Property to another authorised Partner Agent within the network or to manage the Property directly. This may include circumstances where a Partner Agent leaves the network, is unable to continue, requests a transfer, or where service standards or compliance requirements are not being met. Where a Partner Agent leaves the network and intends to continue managing the Property, this will be discussed and agreed with the Landlord to ensure a smooth and compliant transition. Any such transfer shall not constitute termination of this Agreement unless otherwise agreed in writing, and the Landlord will be notified as soon as reasonably practicable and agrees to cooperate with any such transfer." },
      ],
    },
    {
      n: "27",
      title: "Termination of Instructions",
      blocks: [
        { kind: "p", text: "Either party may terminate this Agreement immediately where the other party commits a material breach of its obligations and fails to remedy such breach within 14 days of receiving written notice requiring it to do so. Subject to the above, the Landlord may terminate the management service by giving not less than two months' written notice. Such notice shall not expire before the end of any existing tenancy and the Property being vacated, unless otherwise agreed in writing. The Agent may terminate this Agreement by giving not less than two months' written notice, or immediately where the Landlord fails to pay fees due, provides false or misleading information, or instructs the Agent to act unlawfully. Termination shall not affect any fees, charges or liabilities accrued prior to the termination date." },
      ],
    },
    {
      n: "28",
      title: "Sale of Property",
      blocks: [
        { kind: "p", text: "If the Landlord decides to sell the Property, the Agent may introduce the Landlord to a suitably qualified sales agent within the wider Experts Group network, including The Property Experts, subject to a separate written agreement. No sales commission shall be payable under this Agreement, and any sales instruction will be governed by a separate estate agency contract. The Landlord acknowledges that a sale of the Property does not automatically bring the tenancy to an end. Where the Landlord wishes to sell with vacant possession, they may only seek to recover the Property using the relevant statutory ground for sale, subject to the conditions prescribed by current legislation, including a requirement that the Landlord can demonstrate a genuine intention to sell and that the tenancy has been in place for the minimum period required by law before any notice may be served. The Agent will advise the Landlord on the appropriate process where a managed service has been selected, but recommends that independent legal advice is sought before serving any notice seeking possession for the purpose of sale." },
      ],
    },
    {
      n: "29",
      title: "Right to Cancel",
      blocks: [
        { kind: "p", text: "Where this Agreement is entered into off-premises or at a distance (including electronically, such as via the Landlord Portal), the Landlord has the right to cancel within 14 days without giving any reason, in accordance with the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013. The cancellation period expires 14 days after the Agreement is entered into. To cancel, the Landlord must inform The Letting Experts Nationwide Ltd of their decision by a clear statement (for example, a letter or email) to the registered office or designated email address. The Landlord may use the model cancellation form at Schedule 1, but it is not obligatory." },
        { kind: "p", text: "If the Landlord requests that the Agent begin performance during the cancellation period, and the services are fully performed within that period, the right to cancel will be lost. If the Landlord cancels after performance has begun but before the services are fully performed, the Landlord shall pay for services supplied to the date of cancellation, including reasonable marketing and administration costs." },
      ],
    },
    {
      title: "Signatures",
      blocks: [
        { kind: "p", text: "By signing below, the Landlord confirms that they have read, understood and agree to be bound by this Agreement, including the Definitions, Agreement Details and Clauses 1–29 set out above." },
        { kind: "signatures" },
      ],
    },
    {
      title: "Express Request to Begin Services During Cooling-Off Period",
      blocks: [
        {
          kind: "waiver",
          text: "I/We expressly request that The Letting Experts Nationwide Ltd begin performance of the services immediately, before the expiry of the 14-day cancellation period. I/We understand that if the Agreement is fully performed within the cancellation period, the right to cancel will be lost. If I/We cancel after performance has begun but before the Agreement is fully performed, I/We agree to pay reasonable costs for services provided up to the date of cancellation.",
        },
      ],
    },
    {
      title: "Schedule 1 - Model Cancellation Form",
      blocks: [
        { kind: "p", text: "Complete and return this form only if you wish to cancel the contract within the 14-day cooling-off period." },
        { kind: "p", text: "<strong>To:</strong> The Letting Experts Nationwide Ltd – 5 Regent Street – Rugby – CV21 2PE" },
        { kind: "p", text: "Email: hello@thelettingexperts.co.uk" },
        { kind: "p", text: "I/We hereby give notice that I/We cancel my/our contract for the supply of the following service:" },
        { kind: "list", items: ["Property Address:", "Name of Landlord(s):", "Signed:", "Dated:"] },
        { kind: "p", text: "0333 344 9915 · hello@thelettingexperts.co.uk · www.thelettingexperts.co.uk" },
      ],
    },
  ],
};
