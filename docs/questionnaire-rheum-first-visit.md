# Questionnaire: rheumatology first visit (pre-visit intake)

Status: draft for clinical review by Dr. Zamora. Prepared 2026-10-05.

## Purpose and scope

This document defines the required items of the FHIR R4 `Questionnaire` that guides pokta-clinic's voice agent during the pre-visit intake for a Patient's first consultation at a private rheumatology practice in Mexico. The agent collects history only, in the Patient's own words, and writes it to the EHR as a `QuestionnaireResponse`. It never diagnoses, never scores or applies classification criteria, never triages acuity, and never advises on medication. The criteria cited below are given only to explain why each item matters to a rheumatologist at a first visit; the agent does not compute them. The Practitioner reviews every answer before or during the Appointment and remains responsible for all clinical judgement. The Questionnaire fixes what must be covered, not the order: the agent may ask items in whatever sequence the Conversation allows. Red flags (Emergencia, Urgencia) are detected and handled by a separate mechanism and are out of scope here.

## Required items

| # | linkId | Item | FHIR type | Required |
|---|--------|------|-----------|----------|
| 1 | `chief-complaint` | Chief complaint | string | yes |
| 2 | `onset-duration` | Onset and duration | string | yes |
| 3 | `joints-involved` | Joints involved and symmetry | open-choice (repeats) + choice | yes |
| 4 | `morning-stiffness-min` | Morning stiffness duration (minutes) | integer | yes |
| 5 | `joint-swelling` | Joint swelling | boolean | yes |
| 6 | `systemic-symptoms` | Systemic symptoms (fever, weight loss, fatigue) | choice (repeats) | yes |
| 7 | `extra-articular` | Skin, eye, mouth/dryness symptoms, Raynaud's | choice (repeats) | yes |
| 8 | `current-medications` | Current medications (incl. steroids, NSAIDs, DMARDs/biologics) | string (repeats) | yes |
| 9 | `allergies` | Allergies | string (repeats) | yes |
| 10 | `prior-dx-tests` | Prior diagnoses, labs and imaging | string | yes |
| 11 | `family-history` | Family history of autoimmune or rheumatic disease | open-choice (repeats) | yes |

"Required" means the agent must attempt the item and record an answer; "no sabe" (unknown) and "no aplica" are valid recorded answers so a Patient who does not know never blocks the intake. Prompts below are examples in Mexican Spanish using "usted"; the agent may rephrase them naturally.

## 1. Chief complaint (`chief-complaint`)

Rationale: the reason for consultation, in the Patient's own words, frames the whole first visit and tells the Practitioner which differential to prepare (inflammatory arthritis, connective tissue disease, back pain, a referral for an abnormal lab). Mexican regulation requires the clinical history to document the "padecimiento actual" [11].

FHIR type: `string`, linkId `chief-complaint`. Stored verbatim (or as a close paraphrase confirmed with the Patient).

Example prompt: "Para empezar, cuénteme con sus propias palabras: ¿cuál es el motivo principal por el que quiere ver a la doctora?"

References: [11], [2].

## 2. Onset and duration (`onset-duration`)

Rationale: symptom duration is one of the four scoring domains of the 2010 ACR/EULAR RA classification criteria (less than 6 weeks versus 6 weeks or more) [1]. Recent onset (under one year) is also one of the seven parameters of the EULAR definition of arthralgia suspicious for progression to RA [4], and the Mexican RA clinical practice guideline frames early RA as symptoms of at least 6 weeks and under 12 months [12]. Mode of onset (sudden versus gradual) also matters to the Practitioner.

FHIR type: `string`, linkId `onset-duration`. Optional structured child items for a later version: `onset-date` (`date`, approximate allowed) and `onset-mode` (`choice`: repentino / gradual / no sabe).

Example prompt: "¿Desde cuándo empezó con estas molestias? ¿Empezaron de un día para otro o poco a poco?"

References: [1], [4].

## 3. Joints involved and symmetry (`joints-involved`)

Rationale: the number and site of involved joints (large versus small joints) is the most heavily weighted clinical domain of the 2010 ACR/EULAR RA criteria [1]. EULAR's early referral recommendation lists metacarpophalangeal or metatarsophalangeal involvement as a referral feature [3], and the Mexican guideline describes RA as symmetric involvement of small and large joints, with MCP/MTP symmetry part of its diagnostic description [12]. Back pain with inflammatory features (insidious onset, age under 40, improvement with exercise, no improvement with rest, pain at night) points the Practitioner to axial spondyloarthritis [9].

FHIR type: `open-choice` with `repeats = true`, linkId `joints-involved` (answer options such as manos/dedos, muñecas, codos, hombros, rodillas, tobillos, pies/dedos de los pies, cadera, cuello, espalda baja, plus free text). Child item `joints-symmetry` (`choice`: ambos lados / un solo lado / no sabe). Child item `back-pain-pattern` (`string`) captured only when the Patient reports back pain, recorded descriptively, not scored.

Example prompt: "¿Qué articulaciones le duelen? Por ejemplo, manos, muñecas, rodillas, pies o la espalda. ¿Le duelen de los dos lados por igual o solo de un lado?"

References: [1], [3].

## 4. Morning stiffness duration in minutes (`morning-stiffness-min`)

Rationale: prolonged morning stiffness is a hallmark of inflammatory joint disease. EULAR's early referral recommendation uses morning stiffness of 30 minutes or more as a referral feature [3]; the EULAR arthralgia definition uses 60 minutes or more and "most severe symptoms in early morning" [4]; the Mexican guideline uses 30 minutes or more [12]. Recording minutes (not just yes/no) lets the Practitioner apply whichever threshold they prefer.

FHIR type: `integer`, linkId `morning-stiffness-min` (minutes; 0 if none). If the Patient cannot give a number, the agent records its best estimate from the Patient's description and notes the uncertainty in a companion `string` item `morning-stiffness-note`.

Example prompt: "Al levantarse en la mañana, ¿siente las articulaciones tiesas o rígidas? ¿Cuánto tiempo, más o menos, tarda en quitársele esa rigidez: minutos, media hora, más de una hora?"

References: [3], [4].

## 5. Joint swelling (`joint-swelling`)

Rationale: swelling distinguishes possible synovitis from arthralgia alone. The 2010 ACR/EULAR RA criteria apply only to patients with at least one joint with definite clinical synovitis [1], EULAR's early referral recommendation lists three or more swollen joints as a referral feature [3], and the 2016 EULAR early arthritis recommendations address the recognition of arthritis and referral [2]. The Patient's report is a history item only; synovitis is confirmed on the Practitioner's examination.

FHIR type: `boolean`, linkId `joint-swelling`. Child item `joint-swelling-sites` (`string`) when true.

Example prompt: "¿Ha notado alguna articulación hinchada o inflamada, que se vea más gruesa de lo normal? ¿Cuál?"

References: [1], [3].

## 6. Systemic symptoms (`systemic-symptoms`)

Rationale: fever, unintentional weight loss and fatigue suggest systemic inflammatory or connective tissue disease and widen the differential beyond isolated joint disease. Fever is the constitutional domain item of the 2019 EULAR/ACR SLE classification criteria [5]. Weight loss and fatigue have no single classification-criteria anchor; their inclusion is standard review of systems, which the Mexican clinical history norm requires ("interrogatorio por aparatos y sistemas") [11].

FHIR type: `choice` with `repeats = true`, linkId `systemic-symptoms` (options: fiebre, pérdida de peso sin buscarla, cansancio o fatiga, ninguno). Child item `systemic-symptoms-detail` (`string`) for duration and amount of weight lost.

Example prompt: "En las últimas semanas, ¿ha tenido fiebre, ha bajado de peso sin proponérselo, o se ha sentido mucho más cansado o cansada de lo normal?"

References: [5], [11].

## 7. Skin, eye, mouth/dryness symptoms and Raynaud's (`extra-articular`)

Rationale: extra-articular features direct the Practitioner toward specific connective tissue diseases. The 2019 EULAR/ACR SLE criteria include mucocutaneous items (non-scarring alopecia, oral ulcers, cutaneous lupus) [5]. Persistent dry eyes or dry mouth for more than 3 months form the symptom-based entry requirement of the 2016 ACR/EULAR Sjögren's criteria [6]. Raynaud's phenomenon is a weighted item of the 2013 ACR/EULAR systemic sclerosis criteria [7]. Psoriasis and uveitis are spondyloarthritis features in the ASAS criteria [8].

FHIR type: `choice` with `repeats = true`, linkId `extra-articular` (options: ronchas o manchas en la piel, sensibilidad al sol, psoriasis, caída de cabello, llagas en la boca, ojos secos o con arenilla, ojo rojo y doloroso, boca seca, dedos que se ponen blancos o morados con el frío, ninguno). Child item `extra-articular-detail` (`string`).

Example prompt: "Le voy a preguntar por otras molestias que a veces acompañan a estos problemas. ¿Ha tenido ronchas o manchas en la piel, llagas en la boca, caída de cabello, los ojos o la boca muy secos, o los dedos que se le ponen blancos o morados con el frío?"

References: [5], [6], [7].

## 8. Current medications (`current-medications`)

Rationale: current treatment changes how the first visit is interpreted: corticosteroids and NSAIDs can mask inflammation and alter labs, prior DMARDs or biologics indicate an established diagnosis elsewhere, and the Practitioner needs a full list before prescribing (interactions, comorbidities). The Mexican clinical history norm requires that the history of present illness ask about prior conventional, alternative and traditional treatments [11], which matters in Mexico where self-medication and herbal remedies are common. The Mexican College of Rheumatology RA treatment guideline frames which drug classes (glucocorticoids, conventional synthetic DMARDs, biologics) are relevant [10].

FHIR type: `string` with `repeats = true`, linkId `current-medications` (one entry per drug: name, dose if known, how long). Child item `steroid-use` (`boolean`) asked explicitly, because Patients often omit short steroid courses or injections.

Example prompt: "¿Qué medicamentos toma actualmente, incluyendo pastillas para el dolor, cortisona o inyecciones, y cualquier remedio natural o tés? Si los tiene a la mano, puede leerme el nombre de la caja."

References: [11], [10].

## 9. Allergies (`allergies`)

Rationale: drug allergies constrain prescribing at the first visit (for example, sulfa allergy and sulfasalazine, or prior reactions to NSAIDs). Note for the reviewer: NOM-004-SSA3-2012 does not use the word "alergia" anywhere; allergies are conventionally recorded under "antecedentes personales patológicos", which the norm does require [11]. No source verified in this pass names allergies as a rheumatology-specific first-visit item, so this item rests on general clinical practice.

FHIR type: `string` with `repeats = true`, linkId `allergies` (substance and reaction). "Ninguna conocida" is a valid answer.

Example prompt: "¿Es alérgico o alérgica a algún medicamento, alimento u otra cosa? ¿Qué le pasó cuando tuvo la reacción?"

References: [11] (indirect, see note).

## 10. Prior diagnoses, labs and imaging (`prior-dx-tests`)

Rationale: many Patients arrive with a previous diagnosis or with results ordered by a primary care physician. Serology (RF, ACPA/anti-CCP) and acute phase reactants (ESR, CRP) are scoring domains of the 2010 ACR/EULAR RA criteria [1]; the systematic review informing the 2016 EULAR early arthritis update confirmed the diagnostic value of RF and ACPA and the prognostic value of baseline X-ray damage [2]; a positive ANA is the entry criterion of the 2019 SLE criteria [5]. The agent records what the Patient reports and asks them to bring the documents; it does not interpret values.

FHIR type: `string`, linkId `prior-dx-tests`. Child item `brings-documents` (`boolean`): whether the Patient will bring results to the Appointment.

Example prompt: "¿Algún médico le ha dicho antes qué tiene? ¿Le han hecho estudios de sangre, como factor reumatoide, anti-CCP o anticuerpos antinucleares, o radiografías? Si tiene los resultados, por favor tráigalos a su cita."

References: [1], [2].

## 11. Family history of autoimmune or rheumatic disease (`family-history`)

Rationale: a first-degree relative with RA is one of the seven parameters of the EULAR definition of arthralgia suspicious for progression to RA [4], and family history of spondyloarthritis is an SpA feature in the ASAS axial SpA criteria [8]. Mexican regulation requires "antecedentes heredo-familiares" in every clinical history [11].

FHIR type: `open-choice` with `repeats = true`, linkId `family-history` (options: artritis reumatoide, lupus, psoriasis, espondilitis, enfermedad de la tiroides, otra; plus free text with the relative, e.g. "mamá, artritis reumatoide").

Example prompt: "¿Alguien en su familia, como sus papás, hermanos o hijos, tiene artritis reumatoide, lupus, psoriasis u otra enfermedad reumática o autoinmune?"

References: [4], [11].

## Cross-reference

Red flags reported at any point during the Conversation (for example, suspected giant cell arteritis or septic arthritis) end the intake and are handled by the separate Red flag mechanism, not by this Questionnaire.

## Questions for the reviewing rheumatologist

1. Are any items missing that you need at a first visit, for example comorbidities (diabetes, hypertension, tuberculosis exposure, hepatitis B/C), pregnancy or plans for pregnancy, smoking, or gastrointestinal symptoms (inflammatory bowel disease)?
2. Should the intake include a patient-reported pain score (0 to 10 VAS) and a short function question in the style of the HAQ (for example, difficulty dressing or making a fist), even though the agent will not interpret them?
3. Is the Mexican Spanish wording natural for your patients, especially "rigidez", "articulaciones" versus "coyunturas", and the Raynaud's description? Are there regional terms we should accept?
4. For morning stiffness, is a single number of minutes enough, or do you prefer the categories you use in your own notes?
5. Should the agent ask Patients to photograph or upload prior lab and imaging results before the Appointment, or only ask them to bring paper copies?

## References

1. Aletaha D, Neogi T, Silman AJ, Funovits J, et al. 2010 rheumatoid arthritis classification criteria: an American College of Rheumatology/European League Against Rheumatism collaborative initiative. Ann Rheum Dis. 2010;69(9):1580-1588. doi:10.1136/ard.2010.138461. PMID 20699241. (Also published in Arthritis Rheum. 2010;62(9):2569-2581, doi:10.1002/art.27584.)
2. Combe B, Landewe R, Daien CI, Hua C, et al. 2016 update of the EULAR recommendations for the management of early arthritis. Ann Rheum Dis. 2017;76(6):948-959. doi:10.1136/annrheumdis-2016-210602. PMID 27979873. Companion systematic review: Hua C, Daien CI, Combe B, Landewe R. Diagnosis, prognosis and classification of early arthritis: results of a systematic review informing the 2016 update of the EULAR recommendations for the management of early arthritis. RMD Open. 2017;3(1):e000406. doi:10.1136/rmdopen-2016-000406. https://pmc.ncbi.nlm.nih.gov/articles/PMC5237764/
3. Emery P, Breedveld FC, Dougados M, Kalden JR, et al. Early referral recommendation for newly diagnosed rheumatoid arthritis: evidence based development of a clinical guide. Ann Rheum Dis. 2002;61(4):290-297. doi:10.1136/ard.61.4.290. https://pmc.ncbi.nlm.nih.gov/articles/PMC1754044/
4. van Steenbergen HW, Aletaha D, Beaart-van de Voorde LJ, Brouwer E, et al. EULAR definition of arthralgia suspicious for progression to rheumatoid arthritis. Ann Rheum Dis. 2017;76(3):491-496. doi:10.1136/annrheumdis-2016-209846. PMID 27991858.
5. Aringer M, Costenbader K, Daikh D, Brinks R, et al. 2019 European League Against Rheumatism/American College of Rheumatology classification criteria for systemic lupus erythematosus. Ann Rheum Dis. 2019;78(9):1151-1159. doi:10.1136/annrheumdis-2018-214819. PMID 31383717. (Also Arthritis Rheumatol. 2019;71(9):1400-1412, doi:10.1002/art.40930, https://pmc.ncbi.nlm.nih.gov/articles/PMC6827566/)
6. Shiboski CH, Shiboski SC, Seror R, Criswell LA, et al. 2016 American College of Rheumatology/European League Against Rheumatism classification criteria for primary Sjögren's syndrome: a consensus and data-driven methodology involving three international patient cohorts. Arthritis Rheumatol. 2017;69(1):35-45. doi:10.1002/art.39859. https://pmc.ncbi.nlm.nih.gov/articles/PMC5650478/ (Also Ann Rheum Dis. 2017;76(1):9-16, doi:10.1136/annrheumdis-2016-210571.) The wording of the dryness inclusion questions was confirmed via secondary sources, not the full text.
7. van den Hoogen F, Khanna D, Fransen J, Johnson SR, et al. 2013 classification criteria for systemic sclerosis: an American College of Rheumatology/European League Against Rheumatism collaborative initiative. Arthritis Rheum. 2013;65(11):2737-2747. doi:10.1002/art.38098. https://pmc.ncbi.nlm.nih.gov/articles/PMC3930146/ (Also Ann Rheum Dis. 2013;72(11):1747-1755, doi:10.1136/annrheumdis-2013-204424.)
8. Rudwaleit M, van der Heijde D, Landewé R, Listing J, et al. The development of Assessment of SpondyloArthritis international Society classification criteria for axial spondyloarthritis (part II): validation and final selection. Ann Rheum Dis. 2009;68(6):777-783. doi:10.1136/ard.2009.108233. PMID 19297344. The specific SpA feature list (psoriasis, uveitis, family history) is cited from the criteria as commonly published; the abstract alone does not enumerate it.
9. Sieper J, van der Heijde D, Landewé R, Brandt J, et al. New criteria for inflammatory back pain in patients with chronic back pain: a real patient exercise by experts from the Assessment of SpondyloArthritis international Society (ASAS). Ann Rheum Dis. 2009;68(6):784-788. doi:10.1136/ard.2008.101501. PMID 19147614.
10. Abud-Mendoza C, Aceves-Ávila FJ, Arce-Salinas CA, Álvarez Nemegyei J, et al. Update of the guidelines for the pharmacological treatment of rheumatoid arthritis by the Mexican College of Rheumatology 2023. Reumatol Clin (Engl Ed). 2024;20(5):263-280. doi:10.1016/j.reumae.2024.02.009. PMID 38796394. Content not reviewed beyond title and abstract-level metadata.
11. Secretaría de Salud. NORMA Oficial Mexicana NOM-004-SSA3-2012, Del expediente clínico. Diario Oficial de la Federación, 29 June 2012. Section 6.1.1 (Interrogatorio). https://dof.gob.mx/nota_detalle_popup.php?codigo=5272787
12. Centro Nacional de Excelencia Tecnológica en Salud (CENETEC). Guía de Práctica Clínica: Diagnóstico y Tratamiento de Artritis Reumatoide del Adulto. Evidencias y Recomendaciones (IMSS-195-10). México: Secretaría de Salud; 2009. https://www.facmed.unam.mx/sg/css/GPC/SIDSS-GPC/gpc/docs/IMSS-195-10-ER.pdf (UNAM mirror; the cenetec-difusion.com copy currently resolves to an unrelated site). Whether a newer edition supersedes it is unverified.
