/**
 * THE PRESCRIBED RENT-INCREASE NOTICE, WORD FOR WORD (Scotland, PRT).
 *
 * The form is prescribed by the Private Residential Tenancies (Prescribed
 * Notices and Forms) (Scotland) Regulations 2017 under section 22(1) of the
 * Private Housing (Tenancies) (Scotland) Act 2016, published by the Scottish
 * Government with its guidance notes for landlords and for tenants. Its
 * wording must not be altered: only the blanks are ours to fill. So it lives
 * here once, as blocks, and both the live preview on the send screen
 * (components/rent-review/NoticePaper) and the PDF that goes to the tenant
 * (lib/rent-increase-notice-pdf) draw these same words. Nothing else may
 * write the notice's text.
 *
 * Only the line breaks of the source copy were mended. Its own quirks stay
 * (the "I//we" in Part 3 is in the published form). The Scottish Association
 * of Landlords' cover page on their Word template is theirs, not the
 * prescribed form, and is not used.
 *
 * Client-safe: no imports.
 */

export type Slot =
  | "tenantNames" | "letAddress" | "landlordName" | "landlordAddress" | "agentAddress"
  | "currentRent" | "newRent" | "effectiveDate" | "lastIncrease" | "signature" | "signedOn" | "noticeDate";

/** A run of words: plain, bold, italic, a filled blank, or a footnote mark. */
export type Run = string | { b: string } | { i: string } | { bi: string } | { v: Slot } | { fn: number };

export type Block =
  | { k: "title"; text: string }
  | { k: "subtitle"; text: string }
  | { k: "p"; runs: Run[]; bold?: boolean; size?: "big" }
  | { k: "bullets"; items: Run[][]; indent?: boolean }
  | { k: "numbered"; items: { n: string; runs: Run[] }[] }
  | { k: "value"; v: Slot }
  | { k: "check"; ticked: boolean; runs: Run[]; sub?: Run[][] }
  | { k: "sign"; runs: Run[]; v: Slot }
  | { k: "rule" }
  | { k: "page" }
  | { k: "footnote"; n: number; text: string };

/** Which page of the form each part starts on, for the preview's jump links. */
export type Part = "part1" | "part2a" | "part2b" | "part3" | "landlords" | "tenants";

export interface Section { id: Part; label: string; blocks: Block[] }

const ADVICE_LIST: Run[][] = [
  ["your local council"],
  ["Shelter Scotland"],
  ["your local Citizen’s Advice Bureau"],
  ["a solicitor (you may be able to get legal aid depending on your income)"],
];

export const NOTICE: Section[] = [
  {
    id: "part1",
    label: "Part 1",
    blocks: [
      { k: "title", text: "RENT-INCREASE NOTICE" },
      { k: "subtitle", text: "LANDLORD’S RENT-INCREASE NOTICE TO TENANT(S) UNDER SECTION 22(1) OF THE PRIVATE HOUSING (TENANCIES) (SCOTLAND) ACT 2016" },
      { k: "p", bold: true, runs: ["Important information for the Tenant(s) - Please read this notice carefully."] },
      { k: "p", runs: [{ b: "Advice - " }, "If you have questions about this notice, speak to your landlord or contact one of the following:"] },
      { k: "bullets", items: ADVICE_LIST },
      { k: "p", runs: ["This notice informs you, as a Tenant, that your Landlord wants to increase the rent for your private residential tenancy. The new rent will start from the date shown in Part 2 of this notice unless you take one of the following actions:"] },
      {
        k: "numbered",
        items: [
          { n: "1.", runs: ["reach an agreement with your Landlord to further delay the rent increase."] },
          { n: "2.", runs: ["refer this notice to a Rent Officer for a rent determination, using the specific referral to a Rent Officer form, within 21 days of receiving this notice. This option is not available if the Let Property is located in a rent pressure zone."] },
          { n: "3.", runs: ["can prove that your Landlord did not give you enough notice of the increase."] },
        ],
      },
      { k: "p", runs: ["You must complete Part 3 of this form and return it to your Landlord. If you do not do this, the rent increase will start from the date shown in Part 2 of this notice."] },
      { k: "p", runs: ["If you apply to a Rent Officer to challenge the proposed increase to your rent the Rent Officer can increase as well as reduce your rent."] },
      { k: "p", runs: [{ b: "Part 1 – THE TENANT AND THE LET PROPERTY " }, { i: "(this part must always be completed by the Landlord)" }] },
      { k: "p", runs: ["Tenant(s) name(s):"] },
      { k: "value", v: "tenantNames" },
      { k: "p", runs: ["Let property (the Tenant(s) address):"] },
      { k: "value", v: "letAddress" },
      { k: "p", runs: ["Is the Let Property mentioned above located in a Rent Pressure Zone (RPZ)?"] },
      { k: "check", ticked: true, runs: ["No ", { i: "(Landlord to complete Part 2a only)" }] },
      { k: "check", ticked: false, runs: ["Yes ", { i: "(Landlord to complete both Part 2a and Part 2b)" }] },
    ],
  },
  {
    id: "part2a",
    label: "Part 2a",
    blocks: [
      { k: "p", runs: [{ b: "Part 2a – THE PROPOSED RENT INCREASE " }, { i: "(this part must always be completed by the Landlord)" }] },
      { k: "p", runs: ["This gives you notice that: ", { i: "(name of Landlord(s))" }] },
      { k: "value", v: "landlordName" },
      { k: "p", runs: ["of: ", { i: "(address of landlords(s))" }] },
      { k: "value", v: "landlordAddress" },
      { k: "p", runs: ["proposes to increase your rent from ", { v: "currentRent" }] },
      { k: "p", runs: ["to a new rent of ", { v: "newRent" }, " for your tenancy at the address in Part 1."] },
      { k: "p", runs: ["The new rent is to take effect from: ", { v: "effectiveDate" }] },
      { k: "p", runs: ["The last time your rent was increased was: ", { v: "lastIncrease" }, "."] },
      { k: "p", runs: ["I confirm that the date the new rent will start from is at least 12 months after any previous rent increase."] },
      { k: "sign", runs: ["Signed: ", { i: "(Landlord/Landlord’s agent)" }], v: "signature" },
      { k: "sign", runs: ["Date: "], v: "signedOn" },
      { k: "p", runs: ["Address of Landlord’s agent ", { i: "(if appropriate):" }] },
      { k: "value", v: "agentAddress" },
    ],
  },
  {
    id: "part2b",
    label: "Part 2b",
    blocks: [
      { k: "page" },
      { k: "p", bold: true, runs: ["Part 2b – IF THE LET PROPERTY IS IN AN RPZ"] },
      { k: "p", bold: true, runs: ["The Let Property is not in a Rent Pressure Zone."] },
    ],
  },
  {
    id: "part3",
    label: "Part 3",
    blocks: [
      { k: "page" },
      { k: "p", bold: true, runs: ["Part 3 – TENANT’S RESPONSE TO THE PROPOSED RENT INCREASE (This part should be completed by the Tenant(s) and returned to the Landlord. If this isn’t done, the rent increase will take effect from the date shown in Part 2 of this notice)"] },
      { k: "p", runs: ["To: (Landlord/Landlord’s letting agent):"] },
      { k: "value", v: "landlordName" },
      { k: "p", runs: ["From: (name of the Tenant(s)):"] },
      { k: "value", v: "tenantNames" },
      { k: "p", runs: ["of: (address of Let Property):"] },
      { k: "value", v: "letAddress" },
      { k: "p", runs: ["[*I/We] acknowledge receipt of the rent increase notice dated ", { v: "noticeDate" }, " and give you notice that:"] },
      { k: "check", ticked: false, runs: ["*I/We accept the new rent to apply from: ", { v: "effectiveDate" }] },
      {
        k: "check",
        ticked: false,
        runs: ["*I/We accept the new rent, but have not been given sufficient notice. I/we can provide evidence that I//we did not receive the rent increase notice until: (insert date) _________________."],
        sub: [["Therefore, the rent increase cannot take effect until _______________(insert date)."]],
      },
      {
        k: "check",
        ticked: false,
        runs: ["*I/We do not accept the new rent to apply from ", { v: "effectiveDate" }, " and propose to apply to a Rent Officer for a determination of the open market rent."],
        sub: [[{ b: "YOU CANNOT CHOOSE THIS OPTION IF THE LET PROPERTY IS IN A RENT PRESSURE ZONE." }]],
      },
      { k: "p", runs: ["Signed: (Tenant(s)/Tenant’s agent)______________________________________"] },
      { k: "p", bold: true, runs: ["If the tenancy is a joint tenancy all Tenants (or their agents) must sign."] },
      { k: "p", runs: ["Date:______________________________________________________________"] },
      { k: "p", runs: ["Address of Tenant’s agents(s) ", { i: "(if appropriate):" }, "______________________________"] },
      { k: "p", runs: ["___________________________________________________________________"] },
      { k: "p", runs: ["* delete ‘I’ or ‘We’ as appropriate"] },
      { k: "p", bold: true, runs: ["If you do not complete and return this part of the form to your Landlord, the rent increase will take effect from the date shown in Part 2 of this notice."] },
      { k: "p", bold: true, size: "big", runs: ["This is an important document. You should make a copy for your own records before returning this section to your Landlord."] },
    ],
  },
  {
    id: "landlords",
    label: "Notes for landlords",
    blocks: [
      { k: "page" },
      { k: "p", bold: true, runs: ["GUIDANCE NOTES FOR LANDLORDS ON THE RENT INCREASE NOTICE"] },
      { k: "p", runs: ["(These notes are for guidance only)"] },
      { k: "p", runs: ["You will use this notice to increase your Tenant(s) rent if they have a private residential tenancy, as set out in the Private Housing (Tenancies) (Scotland) Act 2016", { fn: 1 }, " (the Act)."] },
      { k: "footnote", n: 1, text: "http://www.legislation.gov.uk/asp/2016/19/contents/enacted" },
      { k: "rule" },
      { k: "p", bold: true, runs: ["WHEN TO USE THIS NOTICE"] },
      { k: "numbered", items: [{ n: "1.", runs: ["You may serve this notice on your Tenant only in the following circumstances:"] }] },
      {
        k: "numbered",
        items: [
          { n: "   a)", runs: ["Your Tenant has a private residential tenancy as set out in the Act;"] },
          { n: "   b)", runs: ["You want to increase the rent; and"] },
          { n: "   c)", runs: ["If the rent has previously been increased, this increase is not taking effect earlier than 12 months after the rent was last increased."] },
        ],
      },
      { k: "rule" },
      { k: "p", bold: true, runs: ["GIVING THE RIGHT AMOUNT OF NOTICE"] },
      {
        k: "numbered",
        items: [
          { n: "2.", runs: ["You must give your Tenant at least three months’ notice of the proposed increase. The three month notice period starts on the day the Tenant receives the rent increase notice and ends the same date three months after the Tenant received it. If the month in which it ends does not have that date, the notice period will end on the last day of that month."] },
          { n: "3.", runs: ["For example, if the Tenant received the rent increase notice on 4 March, the three months’ notice period would end on 4 June, so the earliest date the increased rent would apply is 5 June. If the Tenant received the notice on 30 November, the notice period would end on 28 or 29 February (depending on whether it was a leap year), and the earliest date the increased rent would apply is 1 March."] },
          { n: "4.", runs: ["If you do not provide your Tenant with the necessary three months’ notice of an increase, your Tenant will not be required to pay the increased amount until three months has passed since the day they received your rent increase notice."] },
          { n: "5.", runs: ["You must include time for delivery of the notice. See the section on ‘How to serve the notice’."] },
        ],
      },
      { k: "rule" },
      { k: "p", bold: true, runs: ["HOW TO COMPLETE THIS NOTICE"] },
      {
        k: "numbered",
        items: [
          { n: "6.", runs: ["As Landlord you should complete Parts 1 and 2 of this notice."] },
          { n: "7.", runs: ["You should also complete Part 2 (RPZ) if the Let Property is in an area which has been classified by Scottish Ministers as a rent pressure zone."] },
          { n: "8.", runs: ["If you want to include an amount for improvement costs (this is ‘Y’ in the rent increase equation in Part 2 RPZ), you must first apply to a Rent Officer at Rent Service Scotland to obtain a formal decision on the amount you are entitled to add for ‘Y’. You apply to the Rent Officer by using a specific application form called ‘Landlord’s application for a rent increase as a result of improvements made to a property in a rent pressure zone’ (you can get this from the Scottish Government’s website", { fn: 2 }, ", a housing advice service, or by telephoning Rent Service Scotland on 0300 244 7000 or emailing at rss.dundee@gov.scot)."] },
          { n: "9.", runs: ["The Rent Officer will aim to send you the decision within 35 days of receiving your application. You must provide your Tenant with a copy of the Rent Officer’s decision which shows the amount you are entitled to increase the rent by to reflect any improvements made to the Let Property."] },
          { n: "10.", runs: ["You should leave Part 3 blank. This is for your Tenant to fill in when giving you a response to the proposed new rent."] },
        ],
      },
      { k: "footnote", n: 2, text: "https://www.gov.scot/publications/private-residential-tenancy-prescribed-notices-forms/" },
      { k: "rule" },
      { k: "p", bold: true, runs: ["HOW TO SERVE THE NOTICE"] },
      { k: "numbered", items: [{ n: "11.", runs: ["After you sign and date the rent increase notice, you must take steps to ensure your Tenant(s) gets it as soon as possible. You must serve it in one of these ways:"] }] },
      {
        k: "bullets",
        indent: true,
        items: [
          ["by handing it to them"],
          ["by sending it to them recorded delivery post at the address of the Let Property"],
          ["by emailing it to them at their current email address (if they have already agreed that email is their preferred contact method)"],
        ],
      },
      {
        k: "numbered",
        items: [
          { n: "12.", runs: ["Section 26 of the Interpretation and Legislative Reform (Scotland) Act 2010, applies which means that, unless delivered personally, you must allow the Tenant 48 hours to receive the notice. This delivery time should be added on to the three months’ notice you must give the Tenant. Your Tenant can challenge this, but they must provide you with evidence which shows the exact date they received this notice. Your Tenant must have at least three months’ notice of the proposed increase from the day they receive this rent increase notice."] },
          { n: "13.", runs: ["For example, if you send your Tenant a rent increase notice by recorded delivery post or email on 13 January, your Tenant would be expected to receive the rent increase notice on 15 January and the 3 months’ notice period would end on 15 April. So the earliest date the increased rent would start is 16 April."] },
          { n: "14.", runs: ["If you have joint Tenants, all the Tenants must be named in Part 1 of this document or each Tenant must receive an individual copy of this notice."] },
        ],
      },
      { k: "rule" },
      { k: "p", bold: true, runs: ["YOUR TENANT'S RESPONSE"] },
      {
        k: "numbered",
        items: [
          { n: "15.", runs: ["Your Tenant(s) should respond to this rent increase notice by returning Part 3 to you. Make sure your Tenant(s) knows whether this should be sent to you or to an Agent who deals with your affairs."] },
          { n: "16.", runs: ["Your Tenant(s) may ask to discuss the proposed new rent with you (see section NEGOTIATING WITH YOUR TENANT(S)) or will use Part 3 of this notice to respond in one of three ways. By:"] },
        ],
      },
      {
        k: "bullets",
        indent: true,
        items: [
          ["accepting your proposed new rent (if your Tenant(s) accepts the new rent it will start on the date in this Notice)"],
          ["accepting your proposed new rent, but challenging the date on which it will apply (your Tenant(s) must be able to prove that they have not been given enough notice of the rent increase)"],
          ["letting you know that the proposed rent is not acceptable, and they are referring their case to a Rent Officer for a decision on the rent amount (if your Tenant(s) indicates that they want to refer the rent increase notice to a Rent Officer, this must be done within 21 days of the Tenant receiving this rent increase notice. This option is only available if the Let Property is not in a rent pressure zone)"],
        ],
      },
      {
        k: "numbered",
        items: [
          { n: "17.", runs: ["If it’s a joint tenancy and you send one notice and name all of the Tenants in Part 1, all the Tenants must individually sign Part 3. If you send each joint Tenant an individual notice, you will need each of them to sign and return Part 3."] },
          { n: "18.", runs: ["If the Tenant(s) does not complete and return Part 3 to you, the rent increase will start from the date proposed in this notice."] },
        ],
      },
      { k: "rule" },
      { k: "p", bold: true, runs: ["NEGOTIATING WITH YOUR TENANT(S)"] },
      { k: "numbered", items: [{ n: "19.", runs: ["If your Tenant(s) contact you to discuss the proposed rent increase, you should both be aware that you will need to have the discussion in plenty of time so your Tenant(s) has the option of referring the rent increase notice to a Rent Officer (if applicable) for determination of the open market rent. Your Tenant(s) will have 21 days from when they receive this notice to refer their case to a Rent Officer at Rent Service Scotland."] }] },
      { k: "rule" },
      { k: "p", bold: true, runs: ["FURTHER GUIDANCE"] },
      { k: "numbered", items: [{ n: "20.", runs: ["If you are not sure about anything in this notice, (for example, how to complete it or the kind of tenancy your Tenant has), you should get advice from one of the following:"] }] },
      {
        k: "bullets",
        indent: true,
        items: [["your local council"], ["Shelter Scotland"], ["your local Citizen’s Advice Bureau"], ["a solicitor"], ["the Scottish Association of Landlords (a membership organisation)"]],
      },
      { k: "rule" },
      { k: "p", bold: true, runs: ["LEGISLATION"] },
      { k: "p", runs: ["The Private Housing (Tenancies) (Scotland) Act 2016 ‘PART 4 Rent’ gives the legal position on rents in relation to the new private residential tenancy."] },
    ],
  },
  {
    id: "tenants",
    label: "Notes for tenants",
    blocks: [
      { k: "page" },
      { k: "p", bold: true, runs: ["GUIDANCE NOTES FOR TENANTS ON THE RENT INCREASE NOTICE"] },
      { k: "p", runs: ["(These notes are for guidance only)"] },
      { k: "p", runs: ["This notice will be used by your Landlord to increase your rent if you have a private residential tenancy, as set out in the Private Housing (Tenancies) (Scotland) Act 2016", { fn: 3 }, " (the Act)."] },
      { k: "footnote", n: 3, text: "http://www.legislation.gov.uk/asp/2016/19/contents/enacted" },
      { k: "rule" },
      { k: "p", bold: true, runs: ["PART 1 – THE TENANT AND THE LET PROPERTY"] },
      { k: "p", bold: true, runs: ["IS THE LET PROPERTY LOCATED IN A RENT PRESSURE ZONE?"] },
      { k: "numbered", items: [{ n: "1.", runs: ["If the Scottish Ministers have designated the area you live in as a rent pressure zone, there will be a cap on the amount that your rent can increase by. You can check whether the Let Property shown in Part 1 is located in a rent pressure zone on the Scottish Government’s web page at (https://www.mygov.scot/rent-pressure-zone-checker/)."] }] },
      { k: "rule" },
      { k: "p", bold: true, runs: ["PART 2a – THE PROPOSED RENT INCREASE"] },
      { k: "p", bold: true, runs: ["DELIVERY OF THIS NOTICE"] },
      { k: "numbered", items: [{ n: "2.", runs: ["Your Landlord must take steps to ensure that you receive this notice as soon as possible. A notice is only valid if it is served on you in the following ways:"] }] },
      {
        k: "bullets",
        indent: true,
        items: [
          ["by handing it to you"],
          ["by sending it to you recorded delivery post at the address of the Let Property"],
          ["by emailing it to your current email address (if you have previously agreed that email is your preferred contact method)"],
        ],
      },
      {
        k: "numbered",
        items: [
          { n: "3.", runs: ["If your Landlord sends this notice to you by post or email, they must give you 48 hours to receive it. This delivery time should be added on to the three months’ notice your Landlord has to give you. You can challenge the 48 hours delivery time, but you must give your Landlord evidence which shows the exact date you received this notice."] },
          { n: "4.", runs: ["For example, if your Landlord sends this notice to you by recorded delivery on 13 January, you would be expected to receive it on 15 January. So the 3 months’ notice period would start on 15 January (see section ‘YOU ARE ENTITLED TO 3 MONTHS’ NOTICE OF ANY RENT INCREASE’)."] },
        ],
      },
      { k: "rule" },
      { k: "p", bold: true, runs: ["YOU ARE ENTITLED TO 3 MONTHS’ NOTICE OF ANY RENT INCREASE"] },
      {
        k: "numbered",
        items: [
          { n: "5.", runs: ["Your Landlord must give you at least 3 months’ notice of any rent increase. This starts on the day you received the notice and ends on the same date 3 months after you received it. If the month in which it ends does not have that date, then it is the last day of that month."] },
          { n: "6.", runs: ["For example, if you received a rent increase notice on 15 January, the 3 months’ notice period would end on 15 April. So the earliest date the increased rent would apply is 16 April. If you received the notice on 30 November, the notice period would end on 28 or 29 February (depending on whether or not it was a leap year), and the earliest date the increased rent would apply is 1 March."] },
          { n: "7.", runs: ["If you think that your Landlord has not provided you with enough notice, you must be able to give evidence to support your claim. You should send a copy of the evidence to your Landlord along with the completed Part 3 of this form."] },
        ],
      },
      { k: "rule" },
      { k: "p", bold: true, runs: ["FREQUENCY OF RENT INCREASES"] },
      { k: "numbered", items: [{ n: "8.", runs: ["A Landlord can only increase your rent using this notice if:"] }] },
      {
        k: "bullets",
        indent: true,
        items: [
          ["you have a private residential tenancy, and"],
          ["at least 12 months will have passed between the date of your last rent increase, and the date of the proposed rent increase shown in Part 2 of this notice."],
        ],
      },
      { k: "numbered", items: [{ n: "9.", runs: ["If this is the first rent increase since the tenancy began, the rent increase can take place within 12 months of the start date of the tenancy. If there is less than 12 months between the date of your last increase and the proposed rent increase date, the rent increase may be illegal, and you may not have to pay it – speak to your Landlord about this."] }] },
      { k: "rule" },
      { k: "p", bold: true, runs: ["IF YOU THINK THE PROPOSED RENT INCREASE IS TOO HIGH – REFER IT TO A RENT OFFICER FOR RENT ADJUDICATION"] },
      {
        k: "numbered",
        items: [
          { n: "10.", runs: ["If the Let Property is NOT located in a rent pressure zone, and you think that the rent increase proposed by your Landlord is too high, you can refer this notice to a Rent Officer for rent adjudication."] },
          { n: "11.", runs: ["Rent Officers are independent officers appointed by statute. They will determine your rent by comparing rents for similar size properties in your area. You have 21 days from the date you received this notice to make a referral to the Rent Officer. Before you make a referral to a Rent Officer, you must tell your landlord that you are going to do this by completing and returning Part 3 of this form to your landlord. If you are a joint tenant and you received a joint notice, make sure Part 3 is signed by all joint tenants. If you each received individual notices, make sure you each sign and send back Part 3 of the notice you received."] },
          { n: "12.", runs: ["You apply to the Rent Officer by using the specific rent adjudication form that can be found at the link: https://www.mygov.scot/apply-about-rent. Printable versions of the form and guidance notes can be found at the link: https://www.gov.scot/publications/private-residential-tenancy-prescribed-notices-forms/. The Rent Officer will aim to send you the decision within 40 days of receiving the completed form. A Rent Officer can increase as well as reduce the amount of rent you pay."] },
          { n: "13.", runs: ["You cannot refer this notice to a Rent Officer if the Let Property is in a rent pressure zone."] },
        ],
      },
      { k: "rule" },
      { k: "p", bold: true, runs: ["PART 2b – IF THE LET PROPERTY IS IN AN RPZ"] },
      { k: "p", bold: true, runs: ["WHAT IS AN RPZ AND HOW DOES THIS AFFECT YOUR RENT?"] },
      {
        k: "numbered",
        items: [
          { n: "14.", runs: ["If you live in an RPZ, your local authority applied to the Scottish Ministers to have the area you live in classified as a Rent Pressure Zone because rents in your area are rising too much. This is causing difficulties for existing Tenants in that area, and having a negative effect on the authority’s housing system."] },
          { n: "15.", runs: ["Scottish Ministers have accepted the authority’s application and classified the area as a rent pressure zone. This means that there is a cap on the amount that your rent can increase by, which is set out in regulations by Scottish Ministers. Any cap set by Ministers is at least the Consumer Prices Index (CPI)", { fn: 4 }, " plus one percent."] },
          { n: "16.", runs: ["Ministers have the power to include an additional percentage to CPI + 1% (this is X in the equation in Part 2(RPZ)), if they consider this appropriate. Landlords can also apply to a rent officer for a determination of an additional amount to reflect any completed property improvements (this is Y in the equation). If your Landlord has included a figure for Y, they must also give you a copy of the letter from the rent officer which shows how much they can increase your rent by to reflect any improvements."] },
          { n: "17.", runs: ["It is against the law for your Landlord to increase your rent by more than the cap set by Ministers. If you think your rent increase is more than the cap, you should:"] },
        ],
      },
      { k: "footnote", n: 4, text: "Consumer Prices Index is a measure of Consumer price inflation and is the speed at which the prices of the goods and services bought by households rise or fall. Consumer price inflation is estimated by the Office of National Statistics using price indices. One way to understand a prices index is to think of a very large shopping basket containing all the goods and services bought by households. The prices index estimates changes to the total cost of this basket." },
      {
        k: "bullets",
        indent: true,
        items: [
          ["speak to your Landlord,"],
          ["contact your local authority, Shelter Scotland or local Citizens Advice Bureau"],
          ["contact a solicitor (you may be able to get legal aid depending on your income)"],
        ],
      },
      { k: "numbered", items: [{ n: "18.", runs: ["If your rent increase is above the cap set by Ministers, you will only be required to pay the amount up to the cap set by Scottish Ministers."] }] },
      { k: "rule" },
      { k: "p", bold: true, runs: ["PART 3 – TENANT’S RESPONSE TO THE PROPOSED RENT INCREASE"] },
      { k: "p", bold: true, runs: ["WHAT YOU NEED TO DO IF YOU HAVE RECEIVED THIS NOTICE"] },
      {
        k: "numbered",
        items: [
          { n: "19.", runs: ["You must return Part 3 to your Landlord as soon as possible. Keep a copy for your records."] },
          { n: "20.", runs: ["You may want to discuss the proposed new rent with your Landlord before you complete and return Part 3. If you contact your Landlord to discuss the proposed rent increase, you should both be aware that you will need to hold the discussion in good time so you still have the option to refer the rent increase notice to a Rent Officer (if applicable) for determination of the open market rent."] },
          { n: "21.", runs: ["You only have 21 days from the date you received this notice to refer a case to a Rent Officer for a rent determination. Before sending your case to a Rent Officer (using the specific rent adjudication form), you must use Part 3 above to tell your Landlord that you are going to refer your case to a Rent Officer."] },
          { n: "22.", runs: ["You cannot refer a case to a rent officer for a rent determination if the Let Property is in a rent pressure zone."] },
          { n: "23.", runs: ["If you get benefits to help you with your rent, you should tell whoever pays them about any changes to your rent amount."] },
        ],
      },
    ],
  },
];

/** The blanks, filled: what each slot prints. A value is one or more lines. */
export type Filled = Record<Slot, string[]>;
