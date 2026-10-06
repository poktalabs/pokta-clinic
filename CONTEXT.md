# pokta-clinic

A voice agent that runs the pre-visit intake for a private rheumatology clinic network in Mexico and writes the result into the network's EHR over HL7 FHIR R4. The EHR is an external system; pokta-clinic works with any FHIR-speaking EHR.

## Clinical (HL7 FHIR R4)

**EHR**:
The Organization's system of record for Patients and their clinical data, run by a third-party vendor and reached only over FHIR R4. In the demo it is the mock vendor "Expediente Demo".
_Avoid_: database, backend, records system

**Patient**:
The person being seen by the Organization, as held in the EHR (FHIR `Patient`). Identified by phone number, with CURP as an optional second identifier.
_Avoid_: user, caller (outside the call itself), client

**Practitioner**:
The rheumatologist who will see the Patient, working at one or more Locations (FHIR `Practitioner`).
_Avoid_: doctor (in code and docs), provider

**Organization**:
The private clinic network (Grupo Médico Articular) that owns the EHR and its Locations (FHIR `Organization`).
_Avoid_: clinic (in code and docs), tenant

**Location**:
A branch of the Organization where the Patient is seen, with its own address, opening hours and CLUES (FHIR `Location`). A Practitioner works at one or more Locations (FHIR `PractitionerRole`).
_Avoid_: clinic, site, sucursal (in code)

**QuestionnaireResponse**:
The patient-reported answers collected during one Conversation, authored by the agent and pending the Practitioner's Validation (FHIR `QuestionnaireResponse`). It feeds the Historia clinica but is never the Historia clinica itself.
_Avoid_: clinical history (in code), form, record, intake (in code)

**Historia clinica**:
The physician-authored, signed clinical history required by NOM-004 (6.1), written from a validated QuestionnaireResponse plus the consultation itself.
_Avoid_: medical history, intake

**Validation**:
The Practitioner's signed act of reviewing a QuestionnaireResponse and accepting it into the Expediente; until then it is pending.
_Avoid_: approval, review

**Expediente**:
The Patient's whole clinical record held by the EHR under NOM-004, owned by the Organization and kept at least 5 years from the last medical act.
_Avoid_: chart, file, record (unqualified)

**Questionnaire**:
The definition of which items a QuestionnaireResponse must cover; it guides the agent's follow-up questions without fixing their order (FHIR `Questionnaire`).
_Avoid_: question bank, script

**Consent**:
The Patient's express agreement to the aviso de privacidad, required before any sensitive health data is stored (FHIR `Consent`).
_Avoid_: opt-in, acceptance

**Appointment**:
The booked first consultation between the Patient and a Practitioner at a Location (FHIR `Appointment`).
_Avoid_: booking, visit, slot (a slot is free time, not a booking)

**Red flag**:
A symptom reported during the Conversation that needs emergency care rather than an Appointment; it ends the intake. Every Red flag has a severity, Emergencia or Urgencia.
_Avoid_: emergency, alert

**Emergencia**:
The Red flag severity for a life-threatening symptom (chest pain, stroke signs, suicidal ideation); the Patient is told to call 911, or Linea de la Vida for suicidal ideation.
_Avoid_: critical, high priority

**Urgencia**:
The Red flag severity for a rheumatology condition that needs same-day emergency care but not an ambulance (suspected giant cell arteritis, septic arthritis); the Patient is told to go to the ER today and the Practitioner is notified.
_Avoid_: urgent appointment, priority booking

## Voice

**Conversation**:
One voice session between a Patient and the agent, identified by the ElevenLabs conversation ID.
_Avoid_: call (unless it is over the phone), session, intake

**Escalation**:
Ending the Conversation's normal path to send the Patient elsewhere (911 guidance on a Red flag); recorded with its reason.
_Avoid_: handoff, transfer (reserved for a transfer to a human or another agent)

**Golden path**:
The scripted demo Conversation: a new Patient who consents, gives a history and books an Appointment.
_Avoid_: happy path, demo flow
