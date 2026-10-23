/**
 * THE SCOTLAND TERMS OF BUSINESS, WORD FOR WORD (23 Oct 2026).
 *
 * This is The Letting Experts' "Landlord Agency Agreement & Terms of Business
 * - Scotland" written down as data, clause by clause, in the contract's own
 * order and numbering. It is the December 2024 wording, standing in until
 * James supplies the October 2026 edition; when that arrives it gets its own
 * id, so contracts already signed on this one keep these words.
 *
 * Clause 4 (Property Information: gas appliances, boiler, alarm, meters,
 * freeholder) is left out on purpose. Those details are now collected after
 * signing, not in the contract. The other clauses keep their printed numbers,
 * so there is no 4 between 3 and 5.
 *
 * The landlord's own details, the fees, the signatures and the request to
 * start marketing straight away are blocks, filled from TermsValues and
 * LandlordDetails, never typed into the words.
 */

import type { TermsDoc } from "@/lib/terms/types";

export const SCOTLAND_DEC24: TermsDoc = {
  id: "scotland-dec24",
  country: "scotland",
  title: "Landlord Agency Agreement & Terms of Business",
  subtitle: "Scotland",
  edition: "December 2024",
  details: [
    { key: "name", label: "Full name", required: true, step: "you" },
    { key: "email", label: "Email address", required: true, kind: "email", step: "you" },
    { key: "phone", label: "Phone number", required: true, kind: "tel", step: "you" },
    {
      key: "address",
      label: "Home address",
      hint: "Your home address, not the property's",
      required: true,
      step: "you",
    },
    {
      key: "registrationNumber",
      label: "Landlord registration number",
      hint: "From your council, e.g. 123456/123/12345",
      required: true,
      step: "registration",
    },
    {
      key: "registrationExpiry",
      label: "Registration expiry date",
      required: true,
      kind: "date",
      step: "registration",
    },
    {
      key: "bankAccountName",
      label: "Name on the account",
      hint: "This is the account your rent is paid into",
      required: true,
      step: "bank",
    },
    { key: "bankName", label: "Bank name", required: true, step: "bank" },
    { key: "sortCode", label: "Sort code", required: true, kind: "sortcode", step: "bank" },
    { key: "accountNumber", label: "Account number", required: true, kind: "account", step: "bank" },
  ],
  sections: [
    {
      title: "The Agreement",
      blocks: [
        {
          kind: "facts",
          rows: [
            { label: "Agent", value: "{{agentName}}" },
            { label: "Property address", value: "{{propertyAddress}}" },
            { label: "Date", value: "{{dateIssued}}" },
          ],
        },
        { kind: "landlords", fields: ["name", "address", "phone", "email"] },
        {
          kind: "p",
          text: "Together with any common ways or shared facilities of the property of which the property forms a part and fixtures, fitting and furniture belonging to the landlord",
        },
      ],
    },
    {
      n: "1",
      title: "Terms and Conditions",
      blocks: [
        {
          kind: "p",
          text: "This document is a legally binding agreement between The Letting Experts (the “Agent”) and the Landlord. It complies with the requirements of Scottish legislation, including the Letting Agent Code of Practice (Scotland) Regulations 2016 and the Private Housing (Tenancies) (Scotland) Act 2016.",
        },
        {
          kind: "p",
          text: "For the purposes of this contract the Partner Agent {{agentName}} will be referred to throughout as The Letting Expert. This contract details the obligations of each party to the other and is a legally binding contract once signed and dated by both parties. This information will be used in the preparation of the tenancy agreement and other legal documentation relating to the property. The Letting Experts are registered with the Scottish Government under the Letting Agent Registration Scheme. The registration scheme is part of the broader efforts to regulate the letting industry and ensure that agents comply with high standards of practice, transparency, and professionalism. This registration is governed by the Letting Agent (Scotland) Act 2014 and is designed to improve the quality of services for landlords and tenants, as well as ensure compliance with legal requirements.",
        },
        {
          kind: "list",
          items: [
            "The Letting Agent Registration Number (LARN) for the Letting Experts is LARN2411003",
            "The Letting Agent Registration Number (LARN for the Partner Agent is {{agentLarn}}",
          ],
        },
      ],
    },
    {
      n: "2",
      title: "Services & Fees",
      blocks: [{ kind: "fees" }],
    },
    {
      n: "3",
      title: "Landlord Registration",
      blocks: [
        {
          kind: "list",
          items: [
            "All landlords in Scotland who rent out residential properties must register with the local council where the property is located.",
            "Once registered, landlords are issued with a unique Landlord Registration Number. This number must be included in advertisements for the property and any formal documents related to the tenancy.",
          ],
        },
        { kind: "landlords", fields: ["registrationNumber", "registrationExpiry"] },
      ],
    },
    {
      title: "Bank Details",
      blocks: [
        { kind: "landlords", fields: ["bankAccountName", "bankName", "sortCode", "accountNumber"] },
      ],
    },
    {
      n: "5",
      title: "Agreement & Declaration",
      blocks: [
        {
          kind: "p",
          text: "<strong>The terms of the Agreement set out in this document will constitute a binding legal contract. If you are unsure of your obligations under this Agreement, then you are advised to seek independent legal advice before signing: You herby confirm:</strong>",
        },
        {
          kind: "list",
          items: [
            "To be the sole or joint owner(s) of the property or have the legal right to authorise the letting of this property.",
            "You have sought permission from your mortgage lender (if any) to let the property.",
            "You have advised your insurers of your intention to let the property and you have the appropriate buildings and contents cover specific to letting your property.",
            "Any service charge or ground rent payments are up to date, and you have permission to let from any freeholder. In addition, you agree that any restrictions or conditions within any lease agreement are fulfilled under the terms of the tenancy agreement. If appropriate, please provide any information that may need to be included within the tenancy agreement.",
            "The property meets the Repairing Standard under the Housing (Scotland) Act 2006.",
            "You have read and understand the following terms and conditions and confirm that The Letting Experts can proceed with the letting and management (if applicable) of your property.",
            "You agree to be bound by the terms and to pay all fees as appropriate.",
          ],
        },
        { kind: "signatures" },
      ],
    },
    {
      n: "6",
      title: "Service Level",
      blocks: [
        {
          kind: "p",
          text: "<strong><em>Having appointed The Letting Experts as Agent upon signing this Agreement, the Agent will provide the following services:</em></strong>",
        },
        { kind: "h", text: "Tenant Find Only (Non-Managed)" },
        {
          kind: "list",
          items: [
            "Value the Property in terms of expected rental income and advise the Landlord on all relevant/related matters and any action required to make the Property suitable for letting.",
            "Erect a ‘To Let’ board outside the property where considered appropriate by The Letting Experts unless otherwise instructed by the Landlord.",
            "Promote the Property to identify a suitable Tenant.",
            "Arrange accompanied viewings for prospective tenants with an agent from The Letting Experts.",
            "Obtain references and/or a credit report of prospective tenant/s for approval.",
            "Draw up the standard form of Private Residential Tenancy (PRT) and service any statutory notices.",
            "Collect first month’s rent and security deposit.",
            "On receipt of initial rent payment, deduct fees and forward balance of money to Landlord via BACS transfer unless otherwise agreed, within 3 working days.",
          ],
        },
        { kind: "h", text: "Letting & Full Management (Managed)" },
        {
          kind: "p",
          text: "<strong><em>In addition to the above, the following services will also be included:</em></strong>",
        },
        {
          kind: "list",
          items: [
            "Arrange for the property to be cleaned, if necessary, prior to letting up to a limit of £100 for a basic clean and £275 for a deep clean to be payable by the Landlord.",
            "Provide the Tenant/s with access to the property including all necessary access codes, keys, fobs, and car parking fobs if required (subject to this information being provided by the Landlord).",
            "Set up a monthly standing order, payable by the Tenant/s direct to The Letting Experts.",
            "Register the deposit with the Tenancy Deposit Scheme and issue the required documents to the Tenants.",
            "Demand rents and forward such, less our fees to the Landlord on the working day it is received.",
            "Payments will be via direct bank transfer, unless otherwise stated by the Landlord, and a detailed rent statement will be forwarded to the Landlord.",
            "Unless provided by the Landlord, to provide an EPC at a cost of from £90 (may be subject to VAT).",
            "Unless provided by the Landlord, to provide an EICR/PAT at a cost of from £150/£70 (may be subject to VAT).",
            "Unless provided by the Landlord, to provide a Gas Certificate if applicable at a cost of from £75 (may be subject to VAT).",
            "Provide the meter readings for the Utility Companies (gas, electricity, and water), local Council authority to the new Tenants at the commencement of the tenancy. In partnership with Helpthemove, they will support the Tenant/s with their utilities transfer. This includes a utility switch service, which provides void cover for the Landlord in between tenancies. Further information will be provided by Helpthemove to the Landlord at the time the property becomes vacant.",
            "A Check-In/Inventory Report will be provided to the Tenant which will include the utility meter readings for them to notify the relevant supplier. This service will only be provided when the Landlord has provided the Agent with access to the meters.",
            "Carry out six monthly inspections at the Property and advise the Landlord on the state and condition of the Property.",
            "The Agent will establish all tenancies as per the Private Housing (Tenancies) (Scotland) Act 2016. PRT agreements are open-ended, with statutory notice periods replacing fixed-term arrangements.",
            "Carry out the duties of the Managing Agent in regard to any repairs and statutory obligations on the ‘s behalf.",
            "Co-ordination of repair or maintenance including arranging tradesmen to attend the property and obtaining estimates where necessary, supervising works and settling accounts from rents received.",
            "Organise and manage any refurbishment works on the property, subject to clause 15 Property Refurbishment Service.",
            "At the end of the Tenancy arrange collection of all keys and entry fobs, check the inventory and prepare a schedule of dilapidations if any for agreement between the Landlord and the Tenant/s.",
            "Return the security deposit to the Tenant/s less any deductions in accordance with the Tenancy Deposit Scheme.",
            "Provide a Rent & Legal Protection policy for an additional fee. (included in the Experts Full Management Service).",
          ],
        },
      ],
    },
    {
      title: "Service Levels",
      blocks: [
        {
          kind: "table",
          head: ["Whats included", "Tenant Find", "Full Management", "Experts Full Management"],
          rows: [
            ["Market Appraisal", "Yes", "Yes", "Yes"],
            ["Preparation of property details & photographs", "Yes", "Yes", "Yes"],
            ["Erect a ‘To Let’ Board", "Yes", "Yes", "Yes"],
            ["Promote property on Rightmove, Zoopla, On the Market", "Yes", "Yes", "Yes"],
            ["Accompanied viewings", "Yes", "Yes", "Yes"],
            ["Comprehensive tenant referencing", "Yes", "Yes", "Yes"],
            ["Private Residential Tenancy (PRT)", "Yes", "Yes", "Yes"],
            ["Rent collection & statements", "", "Yes", "Yes"],
            [
              "Deposit protected in government approved deposit scheme/Flatfair Deposit Replacement",
              "",
              "Yes",
              "Yes",
            ],
            ["Professional Inventory/schedule of condition & check-in", "", "Yes", "Yes"],
            ["Legal notices*", "", "Yes", "Yes"],
            ["Repairs & maintenance co-ordination", "", "Yes", "Yes"],
            ["Property inspections every 6 months", "", "Yes", "Yes"],
            ["Co-ordination of annual Gas Safety & Electrical safety checks", "", "Yes", "Yes"],
            ["Check out inspection & deposit resolution", "", "Yes", "Yes"],
            ["Rent & legal Insurance", "", "", "Yes"],
            [
              "Fee",
              "75% of 1st Month Rent + VAT",
              "12%+VAT (14.4% inc VAT) + 50% of 1st Month Rent+VAT Min fee £500+VAT",
              "14% +VAT (16.8% inc VAT) + 50% of 1st Month Rent+VAT Min fee £500+VAT",
            ],
          ],
        },
        {
          kind: "p",
          text: "*Min fee £500+VAT *Additional fee for the Experts Tenancy Renewal Service - refer to clause 12",
        },
      ],
    },
    {
      n: "7",
      title: "Safety & Compliance",
      blocks: [
        { kind: "h", text: "EPC (Energy Performance Certificate)" },
        { kind: "p", text: "<strong>From £90</strong> (may be subject to VAT)" },
        {
          kind: "p",
          text: "An Energy Performance Certificate provides an environmental impact (CO2) rating for any residential dwelling and must be made available when a building is constructed, sold, or rented. <em>Unless provided by the Landlord, within 7 days prior to the start of the tenancy/renewal The Letting Experts are authorised to provide Energy Performance Certificate at the cost listed.</em>",
        },

        { kind: "h", text: "Gas Safety Certificate" },
        { kind: "p", text: "<strong>From £75</strong> (may be subject to VAT)" },
        {
          kind: "p",
          text: "The Gas Safety Regulations for landlords in Scotland are primarily governed by the Gas Safety (Installation and Use) Regulations 1998, which apply across the UK. These regulations ensure the safe installation, maintenance, and use of gas appliances, fittings, and flues in rental properties. An annual inspection by a qualified ‘Gas Safe’ engineer is a requirement of law under the ‘The Gas Safety (Installation & Use) Regulations 1988. By law a copy of the Gas Safety Certificate should be given to all Tenants at the start of the tenancy for new lets and within 28 days of the gas safety check being completed for any subsequent renewals. <em>Unless provided by the Landlord, within 7 days prior to the start of the tenancy/renewal The Letting Experts are authorised to provide the Gas Certificate at the cost listed.</em>",
        },

        { kind: "h", text: "EICR & PAT Electrical Inspection Condition Report & Portable Appliance Test" },
        { kind: "p", text: "<strong>EICR From £150, PAT From £70</strong> (may be subject to VAT)" },
        {
          kind: "p",
          text: "The Electrical Installation Condition Report (EICR) regulations in Scotland are governed by the Housing (Scotland) Act 2006 and the Repairing Standard, as well as supplementary guidance from Scottish Government regulations. The Landlord must ensure an Electrical Inspection Condition Report is carried out at the property by a qualified person, and any required remedial works specified on the report are carried out within 28 days or as specified in the report. The report must be carried out by a qualified electrician who is registered with an approved body, such as: SELECT (Scotland’s trade association for the electrical industry) or NICEIC (National Inspection Council for Electrical Installation Contracting).",
        },
        {
          kind: "p",
          text: "The EICR forms part of the Repairing Standard under the Housing (Scotland) Act 2006. Failure to provide a valid EICR or ensure safe electrical installations may result in enforcement action by the First-tier Tribunal for Scotland (Housing and Property Chamber). The report is renewed at regular intervals throughout the tenancy (normally every five years or sooner as specified in the report). The EICR should be given to all Tenants at the start of the tenancy for new lets and within 28 days of the EICR being completed for any subsequent renewals.",
        },
        {
          kind: "p",
          text: "Portable Appliance Testing (PAT) in Scotland are not governed by a specific statute but are part of the general duty of care for landlords under health and safety legislation and the Repairing Standard in the Housing (Scotland) Act 2006. There is no statutory requirement for specific intervals, but best practices suggest:",
        },
        {
          kind: "list",
          items: [
            "Annually for appliances in high-risk environments (e.g., kitchens).",
            "At the start of each new tenancy.",
            "More frequently for older appliances or those subject to heavy use.",
            "In tandem with the Electrical Installation Condition Report (EICR) every five years",
          ],
        },
        {
          kind: "p",
          text: "A quote can be provided by The Letting Experts - prices vary subject to size of the property and the number of circuits/portable appliances. Unless provided by the Landlord, within 7 days prior to the start of the tenancy. <em>Unless provided by the Landlord, within 7 days prior to the start of the tenancy/renewal The Letting Experts are authorised to provide the Electric Inspection Condition Report at the cost listed.</em>",
        },

        { kind: "h", text: "Smoke & CO Alarms" },
        { kind: "p", text: "<strong>£75 per alarm</strong> (may be subject to VAT)" },
        {
          kind: "p",
          text: "The rules for smoke and carbon monoxide (CO) alarms in Scotland are governed by the Housing (Scotland) Act 2006 and updated by the Tolerable Standard (Extensions of Criteria) Order 2019, which came into full effect on February 1, 2022. These standards apply to all homes in Scotland, including rented properties. The regulations do not stipulate the type of alarms (such as hard wired or battery powered) to be installed. Landlords should make an informed decision and choose the best alarms for their properties and tenants however the smoke alarms must comply with the British Standards (BS EN 14604). For heat alarms (if installed in kitchens), they must comply with BS 5446-2",
        },
        { kind: "p", text: "<strong>Landlord Responsibilities</strong>" },
        {
          kind: "list",
          items: [
            "The Landlord must ensure alarms are installed to meet these standards before the start of a tenancy.",
            "Alarms must be tested before the tenancy begins and during property inspections.",
            "The Landlord is responsible for replacing or repairing alarms as needed, but tenants should report faults.",
          ],
        },
        { kind: "p", text: "<strong>Tenant Responsibilities</strong>" },
        {
          kind: "list",
          items: [
            "The Tenant should regularly test alarms and replace batteries (if removable) as per the manufacturer’s guidance.",
          ],
        },
        { kind: "p", text: "<strong>Enforcement</strong>" },
        {
          kind: "list",
          items: [
            "Local authorities can enforce compliance under the Housing (Scotland) Act 2006.",
            "Non-compliance may result in the property being deemed below the tolerable standard, which can lead to enforcement notices or fines.",
          ],
        },
        {
          kind: "p",
          text: "<em>Unless provided by the Landlord, within 7 days prior to the start of the tenancy/renewal The Letting Experts are authorised to provide the Smoke CO Alarms at the cost listed.</em>",
        },

        { kind: "h", text: "Legionnaires Risk Assessment" },
        {
          kind: "p",
          text: "In Scotland, Legionella Risk Assessments for rental properties are part of a landlord’s duty under health and safety legislation. While there are no Scotland-specific rules separate from the rest of the UK, the responsibility is covered under the Health and Safety at Work etc. Act 1974 and the Control of Substances Hazardous to Health Regulations 2002 (COSHH) Approved Code of Practice (3rd edition) (ACOP) was published in 2001 with a requirement for landlords of both domestic and business premises to assess the risks from exposure to Legionella to their Tenants. Most Landlords can assess the risk themselves and do not need to be professionally trained or accredited; but if they do not feel competent, or inclined to do so, they can arrange for someone who is to do it on their behalf. <em>The Letting Experts recommends that Landlords refer to the information at: https://www.hse.gov. uk/legionnaires/legionella-landlords-responsibilities.htm. The Letting Experts can arrange for a Risk Assessment to be carried out subject to an additional fee.</em>",
        },

        { kind: "h", text: "Professional Inventory & Check In (Furniture & Furnishings)" },
        { kind: "p", text: "<strong>FREE for Experts Full Management Service</strong>" },
        {
          kind: "p",
          text: "All furniture and furnishings that are provided in a rental property should comply with the Furniture and Furnishings (Fire Safety) Regulations 1988. The Regulations set the levels of fire resistance for domestic upholstered furniture, furnishings and other products containing upholstery. To ensure that they comply with the Regulations, a Landlord must ensure that all of their furniture is “fire resistant”, otherwise they will be committing a criminal offence. The regulations do not apply to antique furniture, or any made before 1st January 1950, bedclothes (including duvets and pillowcases) or loose covers for mattresses, curtains, carpets, sleeping bags or cushion covers. <em>The Letting Experts recommends that a Professional Inventory & Schedule of Condition / Check in is completed at the start of the tenancy which details the fixtures, fittings, and condition of the property. This is included FREE in our Experts Full Management Service.</em>",
        },

        { kind: "h", text: "Tenancy Deposit Protection Scheme" },
        { kind: "p", text: "<strong>FREE for Experts Full Management Service</strong>" },
        {
          kind: "p",
          text: "The rules for deposit protection in Scotland are governed by the Tenancy Deposit Schemes (Scotland) Regulations 2011. These regulations apply to all landlords who take a deposit from tenants in relation to residential tenancies, ensuring deposits are securely held and disputes are resolved fairly.",
        },
        {
          kind: "p",
          text: "All deposits taken for new or renewed tenancies must be registered with an approved tenancy deposit scheme: Safe Deposits Scotland, Letting Protection Service Scotland (LPS Scotland) or MyDeposits Scotland.",
        },
        {
          kind: "p",
          text: "The landlord or letting agent must do this within a given timeframe and issue the deposit scheme’s prescribed information and supporting leaflet/document.For more information visit: www.mygov.scot/tenancy-deposits-landlords It is mandatory for The Letting Experts to hold all deposits on the ‘Full Management Service’ for us to manage any claims or third-party expenses at the end of the tenancy.",
        },
        {
          kind: "p",
          text: "Alternatively, The Letting Experts uses Flatfair Limited to provide a Deposit Replacement product (No Deposit). Flatfair replaces traditional cash deposits with a secure, innovative rental solution that gives landlords up to double the protection - up to 10 weeks rent rather than 5 weeks rent for a traditional deposit, along with fast charge recovery for any damages or unpaid rent. Flatfair’s privacy policy can be found at https://flatfair.co.uk/privacy-policy/. In the event, you do not wish to accept potential tenants using the flatfair No Deposit option please advise of this decision prior to marketing your property for let. Flatfair Limited (“Flatfair”) provides deposit-replacement services (the “Flatfair Service”) through www.flatfair.co.uk (the “Flatfair Portal”). Where, following an introduction by The Letting Experts the tenant purchases a Flatfair No Deposit, from Flatfair Limited, the Tenant maintains the No Deposit throughout the rental period in substitution of the Cash Deposit. The Letting Experts shall be entitled to receive a commission payable by Flatfair; The Landlord accepts that the Flatfair No Deposit will be subject to the Flatfair terms and conditions, which will be provided to the Landlord by Flatfair and is also available by contacting support@flatfair.co.uk; and The Letting Experts shall as soon as reasonably practicable inform the Landlord in the event the Flatfair No Deposit is cancelled, in which case The Letting Experts shall, at the request of the Landlord, collect the Cash Deposit in full from the tenant.",
        },
        {
          kind: "p",
          text: "<em>The Letting Experts will offer your Tenants the option to pay a traditional cash deposit or the Flatfair Deposit Replacement Product. The cash deposit will be registered with one of the Tenancy Deposit Schemes for Scotland as above. free of charge. If you have chosen the ‘Tenant Find’ and do not wish your tenants to be offered the Flatfair Deposit Replacement Product then you will need to set up an account with a government approved Deposit Protection Scheme and notify The Letting Experts prior to marketing your property for let. The Letting Experts will then transfer the deposit to your chosen scheme and a fee will be charged for £50 plus vat.</em>",
        },
        {
          kind: "p",
          text: "<strong><em>You must provide the following information in order for us to transfer the deposit to your nominated Deposit Protection Scheme:</em></strong>",
        },
        {
          kind: "list",
          items: [
            "<em>Your Deposit Scheme membership number, the tenancy reference number and the exact name on the account complete with bank details for your Deposit Scheme for us to transfer the payment directly to the Deposit Scheme provider.</em>",
            "<em>It is your responsibility to serve the prescribed information to the tenant or any interested parties at all relevant periods in accordance with the appropriate scheme and to provide the Letting Experts with the relevant copies.</em>",
            "<em>You will also be responsible for dealing with the scheme administrators for the release of the Deposit or any dispute.</em>",
            "<em>We will not accept any liability for any loss suffered if you fail to comply with the deposit protection legislation, current good practice or Tenancy Deposit Protection Scheme rules.</em>",
          ],
        },

        { kind: "h", text: "Non-Residential (Overseas) Landlords" },
        {
          kind: "p",
          text: "If you live abroad for 6 months or more per year, you’re classed as a ‘non-resident landlord’ by HM Revenue and Customs (HMRC) - even if you’re a UK resident for tax purposes. You are recommended to notify the Inland Revenue via a Non-Resident landlord Form (NRL1), who will subsequently issue us with a certificate allowing us to pay your rent to you in gross and without deductions. Without this certificate, The Letting Experts is obligated by the Finance Act 1995 to deduct tax at the basic rate to cover any tax liability. For further information visit https://www.gov. uk/tax-uk-income-live-abroad/ rent. When completing the NRL1 application form please use the The Letting Experts reference number -904/NA066398. <em>The Landlord confirms that they will notify The Letting Experts of any changes to their UK residency status during the tenancy.</em>",
        },

        { kind: "h", text: "Landlord Registration Scheme" },
        {
          kind: "p",
          text: "Every landlord must register with the local authority where the property is located. The registration confirms that the landlord is \"fit and proper\" to manage rental properties and that the properties meet the Repairing Standard.",
        },
        {
          kind: "list",
          items: [
            "Application Process: Landlords must provide details about their identity, the properties they own, and confirm they meet the legal requirements for managing rental properties.",
            "Fee: A registration fee is required, and the fee amount varies by local authority.",
            "Fit and Proper Test: Landlords must demonstrate that they meet the criteria for being considered \"fit and proper\", which includes:",
          ],
        },
        {
          kind: "list",
          items: [
            "Not having any relevant criminal convictions.",
            "Not being in breach of housing laws or regulations (such as the Repairing Standard).",
            "Not having been involved in illegal activity related to property management (e.g., illegal eviction).",
          ],
        },

        { kind: "h", text: "HMOs" },
        {
          kind: "p",
          text: "In Scotland, the licensing of Houses in Multiple Occupation (HMOs) is governed by the Housing (Scotland) Act 2006 and administered by local authorities. The rules aim to ensure that properties rented to multiple tenants (who are not from a single household) meet certain standards of safety, quality, and management.",
        },
        {
          kind: "p",
          text: "HMO (House in multiple occupation) is a property rented out by at least 3 people who are not from 1 ‘household’ (for example a family) but share facilities like the bathroom and kitchen. It’s sometimes called a ‘house share’. If you want to rent out your property as a house in multiple occupation in England or Wales, you must contact your council to check if you need a licence. You must have a licence if you’re renting out a large HMO. Your property is defined as a large HMO if all of the following apply: it is rented to 5 or more people who form more than 1 household, some or all Tenants share toilet, bathroom, or kitchen facilities, at least 1 Tenant pays rent (or their employer pays it for them) <em>The Landlord confirms agrees to notify The Letting Experts of any Landlord Licensing specific for the property and to provide all the required Certificates and documents within 7 days prior to the start of the tenancy.</em>",
        },

        { kind: "h", text: "Landlords Insurance" },
        { kind: "p", text: "<strong>Buildings & Contents Insurance</strong>" },
        {
          kind: "p",
          text: "The Landlord is responsible for the property being adequately insured for the buildings and contents and that the insurance policy provides cover when the property is occupied with tenants. The Letting Experts will introduce you to a specialist Landlords insurance provider who will offer you a quotation at renewal and if you do not have a policy currently in place.",
        },
        { kind: "p", text: "<strong>Rent & Legal Protection Insurance</strong>" },
        {
          kind: "p",
          text: "To offer additional reassurance Rent and Legal Protection Insurance is available to help protect your rental income should your Tenant fail to pay the rent. For Landlords who let with The Letting Experts and choose our ‘Protected Full Management Service’, we will arrange a Rent and Legal Protection policy provided by LegalforLandlords subject to the tenancy meeting the conditions of the policy provider. LegalforLandlords will cover the rent up to a maximum of £5,000 per month. The rent covered by the insurance will be paid until the limit of the indemnity is met of the Tenant has vacated, whichever occurs first. The cover will continue to pay out even if the policy expires whilst there is an ongoing claim. In addition, LegalforLandlords Legal Protection Insurance provides legal expenses cover to pay for the eviction process if your Tenants remain in arrears and in your property.",
        },

        { kind: "h", text: "Rent & Legal Protection" },
        { kind: "p", text: "<strong>Included in Experts Full Management Service</strong>" },
        {
          kind: "list",
          items: [
            "Covers 100% of the rent until vacant possession**",
            "Plus 75% vacant possession for 3 months",
            "Covers up to £5000 rental payments per month Up to £100k for legal expenses and rent arrears in any one claim",
            "Repossession Recovery of arrears Nuisance and trespass",
            "Defence of criminal prosecutions",
            "Alternative accommodation and storage cost",
            "New or existing tenancies without any no-claims penalty period",
            "NIL EXCESS",
            "For further information on Legal for Landlords Rent and Legal Protection visit https://www.legalforlandlords.co.uk/landlord-rent-legal-protection-insurance/",
          ],
        },
        {
          kind: "p",
          text: "<em>The Landlord agrees to be contacted by The Letting Experts insurance provider regarding all relevant insurance risks and gives consent for their contact details to be provided to them to discuss the policies and cover available to them.</em>",
        },
      ],
    },
    {
      n: "8",
      title: "Confirmation of Instructions",
      blocks: [
        {
          kind: "p",
          text: "The landlord will provide instructions to The Letting Experts regarding termination, proceedings, major repairs or significant details regarding the letting of the property in writing (preferably email).",
        },
      ],
    },
    {
      n: "9",
      title: "Incorrect Information",
      blocks: [
        {
          kind: "p",
          text: "The Landlord warrants that all the information provided to The Letting Experts is correct and to the best of their knowledge. In the event that incorrect information has been provided to The Letting Experts which causes a loss or legal action to be taken against The Letting Experts, the Landlord agrees to indemnify The Letting Experts in respect of any costs, liabilities, fees, disbursements, and losses incurred as a result. The details provided in this agreement will be used in the preparation of the Private Residential Tenancy. These are legally binding documents and The Letting Experts will not be held responsible from issues resulting from the provision of incorrect information.",
        },
      ],
    },
    {
      n: "10",
      title: "Statutory Obligations of the Landlord When Letting Residential Property",
      blocks: [
        {
          kind: "p",
          text: "The statutory obligations of the landlord when letting residential property in Scotland are set out in various pieces of legislation, including the Housing (Scotland) Act 2006, the Repairing Standard, and other associated regulations. These laws and standards aim to ensure that residential properties rented out meet minimum safety, quality, and habitability standards. The Landlord will comply with all applicable laws, regulations and enactments that apply to Landlords and the letting of property of the nature and type of property you wish to let. You will follow such good practices, policies and procedures that would be expected of a responsible, reliable, and competent Landlord. The Landlord hereby warrants to the Agent that: The furniture and furnishings in the property comply with the requirements of Furniture, Furnishings (Fire) (Safety) Regulations 1988 as amended by the Furniture and Furnishings (Fire) (Safety) (Amendment) Regulations 1989 and 1993. The Gas Safety (Installation and Use) Regulations 1998, The Electrical Equipment (Safety) Regulations 1994, The Plug Sockets etc. (Safety) Regulations 1994 and the General Products Regulation 1994 and all other relevant legislation either current or in the future as applicable to the letting of residential Property.",
        },
      ],
    },
    {
      n: "11",
      title: "Repairs and Statutory Obligations - Management Service",
      blocks: [
        {
          kind: "p",
          text: "The Landlord must meet obligations under the Housing (Scotland) Act 2006, ensuring properties are safe, windproof, and fit for human habitation. The Landlord will be held responsible for any injury or losses incurred by the Tenant or a third party at the property as a result of the Landlord failing to ensure the appropriate safety precautions are in place or due to lack of ongoing maintenance of the property. The Landlord hereby agrees to adhere to the standard of repair as set out in Section 11 of the Landlord and Tenant Act 1985.",
        },
        {
          kind: "p",
          text: "The Agent has authority to carry out any necessary repairs to the Property and its contents up to £100 which will be deducted from the rental income. For repair amounts over £100, the Agent will seek the Landlords authorisation. The Agent also has the authority to carry out any appropriate action to comply with all Statutes and Regulations and to incur the necessary expenditure. The Landlord will provide The Letting Experts details of all applicable warranties or guarantee cover for household appliances. The Letting Experts will not be held responsible if work is organised on an appliance under warranty or guarantee if sufficient information has not been supplied. Where the property is managed by The Letting Experts, a Check In/Inventory Report will be provided to the Tenant which will include the utility meter readings for them to notify the relevant suppliers. The Agent shall not be held responsible for the non-payment of Council Tax, Rates (if any) or supply of utilities in respect of the Property.",
        },
      ],
    },
    {
      n: "12",
      title: "Renewal of the Private Residential Tenancy",
      blocks: [
        {
          kind: "p",
          text: "If the tenant wishes to stay in the property, and the landlord agrees, there is no need for a formal renewal process, as the tenancy continues automatically. However, landlords may choose to update the terms of the tenancy or agree on a new rent amount. This can be done through:",
        },
        {
          kind: "list",
          items: [
            "New Tenancy Agreement: If significant changes are made to the agreement (e.g., a new rent amount or other significant terms), a new written agreement may be drawn up and signed by both parties.",
            "Rent Review: If the rent is increased, this must be done following the official rent review process (i.e., providing 3 months' notice)",
          ],
        },
        {
          kind: "p",
          text: "The Letting Experts will provide a PRT Renewal Service to include a comprehensive market update, rent review and property inspection report. Once agreed with your tenant, a new PRT or Rent Increase Notice will be issued to your tenants. The fee for this service is £150 plus VAT.",
        },
      ],
    },
    {
      n: "13",
      title: "Property Refurbishment Service",
      blocks: [
        {
          kind: "p",
          text: "The Letting Experts can provide a Property Refurbishment Service. Our Letting Experts will coordinate the property refurbishment requirements on your behalf, liaise with our local contractors or your chosen contractors, and oversee the works until completion. The fee for this service is £50 plus VAT admin fee for arranging the quotes then 15% plus VAT of the total amount invoiced for the refurbishment.",
        },
      ],
    },
    {
      n: "14",
      title: "Annual Rental Statement",
      blocks: [
        {
          kind: "p",
          text: "The Letting Experts can provide you with an Annual Statement to detail all rental payments, charges and expenses from your property account. This can be used to support your tax returns with all the information provided in one statement. The fee for this service is £50 plus VAT.",
        },
      ],
    },
    {
      n: "15",
      title: "Parking",
      blocks: [
        {
          kind: "p",
          text: "Where the Property has an allocated parking space/s, the Landlord will be responsible for notifying the Agent with the relevant details of the parking space/s number and location. The Landlord indemnifies the Agent from any cost, claims payments and expenses that arises from the supplying the incorrect information.",
        },
      ],
    },
    {
      n: "16",
      title: "Tenant Find Service",
      blocks: [
        {
          kind: "p",
          text: "Where the Landlord opts for the Letting Only Service and does not instruct The Letting Experts as their Managing Agent for the property, then it is the Landlord’s responsibility to carry out any maintenance and repairs to the property and comply with all statutory requirements. The Landlord indemnifies The Letting Experts from and against all costs, claims, damages, and expenses arising because of the Landlord’s negligence or failure to comply with their obligations and statutory requirements.",
        },
        {
          kind: "p",
          text: "As part of The Letting Experts Tenant Find and Rent Collection Services, we will receive the deposit from the Tenant, administer the required documentation and register the deposit with the Tenancy Deposit Scheme or the Flatfair Deposit Replacement Product. As we will not be involved in the end of tenancy procedure or dealing in deposit resolution, we will then rely on the Landlords written instructions along with the tenant’s written confirmation to return the appropriate monies to each party. Alternatively, we can transfer deposit to the landlords own designated Deposit Scheme subject to us receiving the full details and membership number in advance of the tenancy negotiations. The Landlord agrees to inform the Tenant how and where their deposit is being held in accordance with the Housing Act 2004. Please refer to the information and requirements within the section Tenancy Deposit Protection Scheme on page 8.",
        },
      ],
    },
    {
      n: "17",
      title: "Non-UK Resident Landlord",
      blocks: [
        {
          kind: "p",
          text: "Where the Landlord is resident outside the UK or taxed as such they will provide to the Agent their HMRC - NRL1 Approval Number. Should the Landlord not provide this information then The Letting Experts is obliged by the Taxes Management Act 1970 (or any similar powers of any future tax legislation) to deduct tax at the basic rate to cover any tax liability. Reasonable administration charges may be payable to The Letting Experts for further work requested by the Landlord, the Landlord’s accountant, or the Inland Revenue in connection with such tax liabilities.",
        },
      ],
    },
    {
      n: "18",
      title: "Client Identification",
      blocks: [
        {
          kind: "p",
          text: "Under the provisions of the Proceeds of Crimes Act 2001 it is a legal requirement that the Agent must be able to identify their client. Therefore, all Landlords are required to provide The Letting Experts with a copy of their passport or EU photo driving license, proof of address and proof of ownership of property, to be held on file in accordance with the Data Protection Act 1988.",
        },
      ],
    },
    {
      n: "19",
      title: "Data Protection Act",
      blocks: [
        {
          kind: "p",
          text: "All information regarding Landlord/s and Tenant is confidential and will be held strictly in accordance with the provisions of the General Data Protection Regulation (EU) 2016/679 (GDPR).",
        },
      ],
    },
    {
      n: "20",
      title: "Clients Money",
      blocks: [
        {
          kind: "p",
          text: "Clients’ money is held in a client account which is protected by the Client Money Protection Scheme, the details of which can be provided by the Agent. No interest will be paid by any monies held in this account.",
        },
      ],
    },
    {
      n: "21",
      title: "Advance Rent Payments",
      blocks: [
        {
          kind: "p",
          text: "Any advance rent payment will be held by The Letting Experts and released each month in line with the rental due date, unless otherwise agreed. This is to protect both parties should there be a breach in tenancy conditions which results in a subsequent vacation (Rent Collection, Expert Full Management Services).",
        },
        {
          kind: "p",
          text: "Should it be agreed for the landlord to receive the full payment in advance then the landlord is fully responsible for returning any overpaid rental payments to the tenants should the tenancy end sooner than the end of the advance payment term.",
        },
      ],
    },
    {
      n: "22",
      title: "Insurance",
      blocks: [
        {
          kind: "p",
          text: "The Landlord confirms that they will advise their insurers that they are letting the property and secure the necessary buildings, contents, and public liability insurance. The Letting Experts can introduce you to a specialist Landlords insurance policy, details of which are available on request.",
        },
      ],
    },
    {
      n: "23",
      title: "Compliance and Redress Scheme",
      blocks: [
        {
          kind: "p",
          text: "The Letting Experts is a member of the PRS and abides by their code of practice. The Landlord agrees that The Letting Experts may disclose information relating to the letting of the property to the PRS should it be required for a complaint.",
        },
        {
          kind: "p",
          text: "Complaints relating to the Agent's conduct may be escalated to the First-tier Tribunal for Scotland (Housing and Property Chamber).",
        },
        {
          kind: "p",
          text: "Our Company Complaints Process can be found on our website: www.thelettingexperts.co.uk/complaints-handling",
        },
      ],
    },
    {
      n: "24",
      title: "Changes to These Terms and Conditions",
      blocks: [
        {
          kind: "p",
          text: "The Letting Experts may amend these Terms and Conditions at any time without notice. They will be binding with all parties at the time of notification. If the amendments are due to statutory changes, they will take effect immediately upon notification.",
        },
      ],
    },
    {
      n: "25",
      title: "Termination of Instructions",
      blocks: [
        {
          kind: "p",
          text: "Either party shall have the right to terminate this agreement if the other is in persistent or significant breach of any of its obligations under the agreement and fails to remedy such breach within 14 days of notice being received.",
        },
        {
          kind: "p",
          text: "The management services and this agreement may be terminated by the landlord by way of two months written notice, however not before the end of the tenancy and the property being vacated by the tenant/s.",
        },
      ],
    },
    {
      n: "26",
      title: "Sale of Property",
      blocks: [
        {
          kind: "p",
          text: "Where the Landlord sells the Property to a Tenant or other person/s introduced by the Agent during the tenancy a fee of 2% plus VAT of the selling price will be payable by the Landlord to the Agent. The Landlord agrees to notify the Agent of the selling price and instruct his solicitors to deduct the appropriate fee from the proceeds of the sale and remit to the Agent.",
        },
      ],
    },
    {
      n: "27",
      title: "Right to Cancel",
      blocks: [
        {
          kind: "p",
          text: "Subject to the terms of this agreement where this agreement was signed at your home/office, the Landlord has the right under The Cancellation of Contracts made in a Consumer’s Home or Place of Work etc. Regulations 2008 to cancel this agreement within 14 days starting today from when this notice was received.",
        },
        {
          kind: "p",
          text: "The Landlord may exercise this right to cancel if they wish by writing to The Letting Experts at the registered address.",
        },
        {
          kind: "p",
          text: "The landlord may also cancel this Agreement by sending an email to The Letting Experts at any time within the 7 days. Any cancellation notice sent to the Agent will be deemed to have been given as soon as it is posted or, if sent by email, from the day it is sent.",
        },
        { kind: "p", text: "<strong>Performance of the Agreement</strong>" },
        {
          kind: "p",
          text: "I/we the Landlord(s) hereby authorise The Letting Experts to immediately begin marketing the property. Should I/we exercise the right to cancel the agreement I/we will be liable for any reasonable expenses incurred before the cancellation. Should a let be agreed prior to cancellation and result in a tenancy agreement, the fees would remain due, notwithstanding the cancellation took place.",
        },
        {
          kind: "waiver",
          text: "I/we authorise The Letting Experts to start marketing the property immediately.",
        },
      ],
    },
  ],
};
