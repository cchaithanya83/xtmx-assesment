import type { TypingPassage } from './types.ts'

/**
 * Task 1 passage bank.
 *
 * Each assignment owns a pool of *equivalent* passages — same length band, same
 * character-class mix, same difficulty. `pickPassage()` in the typing engine
 * rotates through the pool on every retry so a candidate cannot memorise one
 * body of text.
 */

/* -------------------------------------------------------------------------- */
/*  Assignment 1 — Basic Professional Typing (Easy)                            */
/* -------------------------------------------------------------------------- */

export const A1_PASSAGES: TypingPassage[] = [
  {
    id: 'a1-p1',
    label: 'Operations Briefing',
    kind: 'prose',
    text: 'Thank you for joining the operations team. As an AI Operator you will support live service calls by capturing accurate information while the conversation is still in progress. Your primary responsibility is to record what is said clearly, completely, and without delay. Speed matters, but accuracy always matters more. A single mistyped digit can route a claim to the wrong department and add several days to the resolution timeline. Take a steady pace, keep your hands on the home row, and read one phrase ahead of what you are typing.',
  },
  {
    id: 'a1-p2',
    label: 'Quality Standards',
    kind: 'prose',
    text: 'Every record you create becomes part of a permanent service history that auditors, supervisors, and downstream teams rely on. Before you submit any entry, confirm that names are spelled the way they were provided and that all numeric values match what you heard. Do not guess when information is unclear; mark the field for follow up instead. Consistency in formatting allows the reporting system to group records correctly, so please follow the documented conventions for dates, amounts, and identifiers at all times.',
  },
  {
    id: 'a1-p3',
    label: 'Shift Handover',
    kind: 'prose',
    text: 'At the end of each shift you are expected to complete a short handover summary for the incoming operator. Describe any open items, note the accounts that still require verification, and flag anything that was escalated to a supervisor. Keep the summary factual and concise. Avoid abbreviations that are not part of the approved glossary, because a colleague reading your notes may not share the same context. Clear written handovers reduce repeated work and protect the service level agreement for the entire team.',
  },
  {
    id: 'a1-p4',
    label: 'Communication Protocol',
    kind: 'prose',
    text: 'When you are unsure about a detail, ask for it to be repeated rather than entering an approximation. Professional operators confirm rather than assume. Use the standard confirmation phrasing, repeat the value back, and wait for acknowledgement before moving on. If the line quality is poor, note that in the record so the reviewer understands why a field was left incomplete. These small habits separate a reliable operator from one whose work must be checked twice.',
  },
]

/* -------------------------------------------------------------------------- */
/*  Assignment 2 — Names, Dates & Numbers (Easy–Medium)                        */
/* -------------------------------------------------------------------------- */

export const A2_PASSAGES: TypingPassage[] = [
  {
    id: 'a2-p1',
    label: 'Member Intake Sheet A',
    kind: 'structured',
    text: `Member Name: Jennifer Anderson
Date of Birth: 04/17/1991
Phone: (214) 555-0187
Email: jennifer.anderson@northvalleyhealth.com
Address: 4821 Brookhaven Drive, Plano, TX 75024
Effective Date: 01/01/2026
Annual Premium: $4,380.00
Monthly Contribution: $365.00
Secondary Contact: Marcus Whitfield
Secondary Phone: (972) 555-0431
Date of Last Claim: 11/23/2025
Approved Amount: $1,247.50`,
  },
  {
    id: 'a2-p2',
    label: 'Member Intake Sheet B',
    kind: 'structured',
    text: `Member Name: Rajesh Krishnamurthy
Date of Birth: 09/02/1987
Phone: (469) 555-0293
Email: rajesh.krishnamurthy@meridiancare.org
Address: 1730 Copperfield Lane, Irving, TX 75063
Effective Date: 03/15/2026
Annual Premium: $5,124.00
Monthly Contribution: $427.00
Secondary Contact: Priyanka Balasubramanian
Secondary Phone: (214) 555-0776
Date of Last Claim: 08/09/2025
Approved Amount: $2,918.75`,
  },
  {
    id: 'a2-p3',
    label: 'Member Intake Sheet C',
    kind: 'structured',
    text: `Member Name: Katherine O'Donnell
Date of Birth: 12/28/1974
Phone: (817) 555-0642
Email: katherine.odonnell@summitbenefits.net
Address: 926 Silverleaf Court, Arlington, TX 76012
Effective Date: 07/01/2026
Annual Premium: $6,960.00
Monthly Contribution: $580.00
Secondary Contact: Gregory Vasquez-Lin
Secondary Phone: (682) 555-0158
Date of Last Claim: 02/14/2026
Approved Amount: $843.20`,
  },
  {
    id: 'a2-p4',
    label: 'Member Intake Sheet D',
    kind: 'structured',
    text: `Member Name: Olumide Adeyemi
Date of Birth: 06/11/1995
Phone: (512) 555-0904
Email: olumide.adeyemi@crestlinehealth.com
Address: 3407 Windermere Boulevard, Round Rock, TX 78665
Effective Date: 05/01/2026
Annual Premium: $3,744.00
Monthly Contribution: $312.00
Secondary Contact: Aisha Nakamura-Reyes
Secondary Phone: (737) 555-0287
Date of Last Claim: 10/30/2025
Approved Amount: $1,605.00`,
  },
]

/* -------------------------------------------------------------------------- */
/*  Assignment 3 — IDs & Alphanumeric Data (Medium)                            */
/* -------------------------------------------------------------------------- */

export const A3_PASSAGES: TypingPassage[] = [
  {
    id: 'a3-p1',
    label: 'Authorization Batch 4471',
    kind: 'structured',
    text: `Member ID: UHC7845AX92
Policy Number: POL-2291845-TX
Group Number: GRP0084731
Authorization Number: PA-884319-B
Reference Number: REF-72391TX
Claim Number: CLM8847201953
Provider NPI: 1487326590
Tax ID: 75-2938471
Contact Email: auth.review@uhc-provider-services.com
Callback Number: 8005550142
Secondary Auth: AUTH-89372-K
Ticket ID: RQ-89231-04
Batch Reference: BX7719-QA-2026`,
  },
  {
    id: 'a3-p2',
    label: 'Authorization Batch 5528',
    kind: 'structured',
    text: `Member ID: BCB4471TQ08
Policy Number: POL-7734029-AZ
Group Number: GRP0917244
Authorization Number: PA-337482-M
Reference Number: REF-40917AZ
Claim Number: CLM3390477281
Provider NPI: 1902845673
Tax ID: 86-4471928
Contact Email: precert.desk@bcbs-network-ops.com
Callback Number: 8885550719
Secondary Auth: AUTH-52190-R
Ticket ID: RQ-40182-17
Batch Reference: KD2284-QA-2026`,
  },
  {
    id: 'a3-p3',
    label: 'Authorization Batch 6193',
    kind: 'structured',
    text: `Member ID: AET9012MZ47
Policy Number: POL-5580317-FL
Group Number: GRP0442087
Authorization Number: PA-771205-D
Reference Number: REF-93841FL
Claim Number: CLM6620194473
Provider NPI: 1730594862
Tax ID: 59-8827301
Contact Email: utilization.mgmt@aetna-care-review.com
Callback Number: 8775550386
Secondary Auth: AUTH-71633-W
Ticket ID: RQ-77410-29
Batch Reference: LM9038-QA-2026`,
  },
  {
    id: 'a3-p4',
    label: 'Authorization Batch 7052',
    kind: 'structured',
    text: `Member ID: CIG5583KP71
Policy Number: POL-3308914-NC
Group Number: GRP0770315
Authorization Number: PA-559047-T
Reference Number: REF-11724NC
Claim Number: CLM9174028836
Provider NPI: 1648209371
Tax ID: 47-3319085
Contact Email: clinical.intake@cigna-provider-line.com
Callback Number: 8665550927
Secondary Auth: AUTH-30478-J
Ticket ID: RQ-51938-06
Batch Reference: TP4416-QA-2026`,
  },
]

/* -------------------------------------------------------------------------- */
/*  Assignment 4 — Healthcare Data Entry (Medium–Hard)                         */
/* -------------------------------------------------------------------------- */

export const A4_PASSAGES: TypingPassage[] = [
  {
    id: 'a4-p1',
    label: 'Benefit Verification Note A',
    kind: 'mixed',
    text: `Benefit verification completed for the servicing provider listed below. The member remains active with in network status as of the effective date. The individual deductible is $1,500.00 with $420.00 applied year to date, and coinsurance is 20% after the deductible has been satisfied. The specialist copay is $50.00 per visit and the out-of-pocket maximum is $6,850.00 for the individual tier. Prior authorization is required for advanced imaging and outpatient surgical procedures; eligibility was confirmed with the plan on the call reference below.

Servicing Provider: North Valley Medical Center
Network Status: In Network
Deductible: $1,500.00
Coinsurance: 20%
Specialist Copay: $50.00
Out-of-Pocket Maximum: $6,850.00
Prior Authorization: Required
Authorization Number: PA-884319-B
Reference Number: REF-72391TX
Effective Date: 01/01/2026`,
  },
  {
    id: 'a4-p2',
    label: 'Benefit Verification Note B',
    kind: 'mixed',
    text: `Eligibility and benefits were verified for the requested date of service. The member is enrolled under an employer sponsored plan and the servicing provider is contracted, therefore network status is in network. The family deductible is $3,000.00 with $1,140.00 applied year to date, and coinsurance is 30% once the deductible is met. The specialist copay is $75.00 and the out-of-pocket maximum is $9,200.00 for the family tier. Prior authorization is required for durable medical equipment and inpatient admissions.

Servicing Provider: Meridian Regional Hospital
Network Status: In Network
Deductible: $3,000.00
Coinsurance: 30%
Specialist Copay: $75.00
Out-of-Pocket Maximum: $9,200.00
Prior Authorization: Required
Authorization Number: PA-337482-M
Reference Number: REF-40917AZ
Effective Date: 03/15/2026`,
  },
  {
    id: 'a4-p3',
    label: 'Benefit Verification Note C',
    kind: 'mixed',
    text: `Coverage was reviewed with the plan representative and the following benefits apply. The servicing provider is not contracted for this plan year, so network status is out of network and the higher benefit tier applies. The individual deductible is $2,000.00 with $0.00 applied year to date, and coinsurance is 40% after the deductible. The specialist copay does not apply out of network and the out-of-pocket maximum is $12,400.00. Prior authorization is required for all non emergent services and eligibility must be reconfirmed within thirty days.

Servicing Provider: Crestline Orthopedic Associates
Network Status: Out of Network
Deductible: $2,000.00
Coinsurance: 40%
Specialist Copay: Not Applicable
Out-of-Pocket Maximum: $12,400.00
Prior Authorization: Required
Authorization Number: PA-771205-D
Reference Number: REF-93841FL
Effective Date: 07/01/2026`,
  },
]

/* -------------------------------------------------------------------------- */
/*  Assignment 5 — Advanced Mixed Data Challenge (Hard)                        */
/* -------------------------------------------------------------------------- */

export const A5_PASSAGES: TypingPassage[] = [
  {
    id: 'a5-p1',
    label: 'Escalation Case File 2026-0841',
    kind: 'mixed',
    text: `Escalation summary prepared for supervisor review. The member contacted the service line regarding a denied prior authorization for outpatient physical therapy. Eligibility was confirmed as active and in network; however, the original request was submitted under an incorrect servicing provider, which produced the denial. A corrected request has been filed and the plan has committed to a determination within seventy-two business hours. The member was advised that the deductible and coinsurance amounts below remain unchanged, and that the out-of-pocket maximum has not yet been satisfied for the current plan year.

Member Name: Katherine O'Donnell
Date of Birth: 12/28/1974
Member ID: UHC7845AX92
Policy Number: POL-2291845-TX
Phone: (817) 555-0642
Email: katherine.odonnell@summitbenefits.net
Servicing Provider: North Valley Medical Center
Network Status: In Network
Deductible: $1,500.00
Coinsurance: 20%
Specialist Copay: $50.00
Out-of-Pocket Maximum: $6,850.00
Original Authorization: PA-884319-B
Corrected Authorization: AUTH-89372-K
Reference Number: REF-72391TX
Effective Date: 01/01/2026
Determination Due: 02/19/2026
Approved Amount: $1,247.50`,
  },
  {
    id: 'a5-p2',
    label: 'Escalation Case File 2026-1173',
    kind: 'mixed',
    text: `Escalation summary prepared for supervisor review. The member disputed the coinsurance applied to a recent specialist claim and requested a full benefit re-verification. The representative confirmed that the servicing provider terminated its network agreement mid plan year, which moved the claim to the out of network tier. The member was informed that eligibility remains active, that the higher deductible applies from the termination date forward, and that a formal appeal may be filed within one hundred and eighty days of the determination letter.

Member Name: Rajesh Krishnamurthy
Date of Birth: 09/02/1987
Member ID: BCB4471TQ08
Policy Number: POL-7734029-AZ
Phone: (469) 555-0293
Email: rajesh.krishnamurthy@meridiancare.org
Servicing Provider: Crestline Orthopedic Associates
Network Status: Out of Network
Deductible: $2,000.00
Coinsurance: 40%
Specialist Copay: Not Applicable
Out-of-Pocket Maximum: $12,400.00
Original Authorization: PA-337482-M
Corrected Authorization: AUTH-52190-R
Reference Number: REF-40917AZ
Effective Date: 03/15/2026
Determination Due: 04/28/2026
Approved Amount: $2,918.75`,
  },
  {
    id: 'a5-p3',
    label: 'Escalation Case File 2026-1608',
    kind: 'mixed',
    text: `Escalation summary prepared for supervisor review. The member reported that a prior authorization approved in January was not honoured at the point of service, resulting in an unexpected balance. Records confirm that the authorization was issued for the correct procedure code but was attached to a terminated policy number after a mid year plan migration. The corrected policy and authorization details are recorded below, and the claim has been resubmitted for reprocessing under the active plan with no change to the member cost share.

Member Name: Olumide Adeyemi
Date of Birth: 06/11/1995
Member ID: AET9012MZ47
Policy Number: POL-5580317-FL
Phone: (512) 555-0904
Email: olumide.adeyemi@crestlinehealth.com
Servicing Provider: Meridian Regional Hospital
Network Status: In Network
Deductible: $3,000.00
Coinsurance: 30%
Specialist Copay: $75.00
Out-of-Pocket Maximum: $9,200.00
Original Authorization: PA-771205-D
Corrected Authorization: AUTH-71633-W
Reference Number: REF-93841FL
Effective Date: 05/01/2026
Determination Due: 06/12/2026
Approved Amount: $1,605.00`,
  },
]

export const PASSAGE_POOLS: Record<number, TypingPassage[]> = {
  1: A1_PASSAGES,
  2: A2_PASSAGES,
  3: A3_PASSAGES,
  4: A4_PASSAGES,
  5: A5_PASSAGES,
}

/**
 * Rotates through the pool by attempt number so retry N always gets different
 * source text from attempt N-1 (wrapping once the pool is exhausted).
 */
export function pickPassage(assignmentId: number, attemptNumber: number): TypingPassage {
  const pool = PASSAGE_POOLS[assignmentId] ?? A1_PASSAGES
  return pool[(Math.max(1, attemptNumber) - 1) % pool.length]
}
