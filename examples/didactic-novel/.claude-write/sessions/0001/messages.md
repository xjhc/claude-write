========================================================================
SYSTEM (443 chars)
========================================================================

You are a writing agent. Write the artifact in manuscript.md. Keep memory.md current as durable intent, structure, constraints, and open issues. LLMs tend to plan privately and then emit a full draft in one shot; do not default to that when the work benefits from discovery. Use the files as a working surface: draft, read, update memory, and revise in whatever sequence fits the task. Keep reports out of files. Report briefly when you stop.


========================================================================
USER 1 / current pass (446 chars)
========================================================================

<task>
write a didactic novel or scenario-driven narrative to teach agentic harness engineering. Use a business-and-technical learning story structure with recurring characters, concrete incidents, and practical lessons; do not imitate any specific author's prose.
</task>

<filesystem>
  <file path="manuscript.md" bytes="0" words="0" lines="0" headings="0" />
  <file path="memory.md" bytes="0" words="0" lines="0" headings="0" />
</filesystem>

========================================================================
ASSISTANT 2 / current pass (71 chars)
========================================================================

[tool_use] read
path: "manuscript.md"
[tool_use] read
path: "memory.md"

========================================================================
USER 3 / current pass (88 chars)
========================================================================

[tool_result] call_WFbDfnpFD24e6HjBV8V1nzxR

[tool_result] call_BnX0UGFZPDFYPX6pFGdSrbMU

========================================================================
ASSISTANT 4 / current pass (1869 chars)
========================================================================

[tool_use] write
path: "memory.md"
content (1744 chars):
  # Durable intent
  - Write a didactic novel/scenario-driven narrative that teaches agentic harness engineering.
  - Use a business-and-technical learning story structure.
  - Include recurring characters, concrete incidents, and practical lessons.
  - Do not imitate any specific author's prose.
  
  # Working structure
  - Form: accessible novelistic narrative with chapter-like sections.
  - Throughline: a team at a company learns to build, debug, govern, and scale an agent harness in production.
  - Educational goal: each chapter dramatizes one harness engineering concern and extracts practical lessons.
  
  # Candidate cast
  - Maya Chen: newly promoted engineering manager, bridges business pressure and technical ambiguity.
  - Rafael Ortiz: staff engineer, skeptical, strong on systems and failure analysis.
  - Leena Park: product lead, focused on customer outcomes and deadlines.
  - Jonah Bell: operations/compliance lead, worries about auditability, safety, and cost.
  - Nia Okafor: junior engineer/analyst, asks clarifying questions that surface teaching moments.
  
  # Core topics to weave into incidents
  - Defining harness vs model behavior.
  - Tool routing and permissions.
  - Context assembly and memory.
  - Planning vs acting loops.
  - Evaluation and regression testing.
  - Cost/latency budgeting.
  - Human-in-the-loop escalation.
  - Observability, logs, and replay.
  - Failure modes: hallucinated actions, partial tool failures, stale memory, prompt drift.
  - Governance and change management.
  
  # Open issues
  - Decide chapter count and level of realism versus overt didactic explanation.
  - Need a strong opening incident that makes harness engineering feel necessary, not abstract.
  - Need a satisfying ending with business impact and mature engineering practices.

========================================================================
USER 5 / current pass (114 chars)
========================================================================

[tool_result] call_sfbdi34iRBPKE4am8QvVrjAx
ok: wrote 1744 chars to memory.md; now 34 lines, 246 words, 1744 bytes

========================================================================
ASSISTANT 6 / current pass (33546 chars)
========================================================================

[tool_use] write
path: "manuscript.md"
content (32256 chars):
  # The Harness Line
  
  ## Chapter 1: The Demo That Lied
  
  On the Monday that changed everything, Maya Chen stood at the front of the fourth-floor conference room and watched a sales engineer promise an impossible future.
  
  The screen on the wall showed a chat interface branded as if it were already a product. A prospect from a regional logistics firm had asked whether Northstar Systems could automate exception handling for delayed shipments, vendor emails, and refund approvals. The sales engineer, smiling with the confidence of someone borrowing certainty from a prototype, typed:
  
  > Resolve all late-shipment cases from last week and draft customer outreach.
  
  The assistant responded with a smooth paragraph about reviewing records, categorizing cases, generating communications, and escalating edge cases. It sounded calm. Competent. Expensive.
  
  The prospect leaned forward. “Can it actually do that?”
  
  For one half-second, nobody spoke.
  
  Leena Park, Northstar's product lead, answered first. “It can with the right integration path.”
  
  That sentence was technically true in the way a bridge is technically possible before anyone surveys the river.
  
  Maya knew what the system really was: a language model with a prompt, two brittle internal tools, and a habit of sounding more completed than it was. It could summarize shipment notes. It could draft emails if someone pasted data into the right format. It could not, under any defensible definition of the word, resolve all late-shipment cases.
  
  But the prospect heard possibility, and possibility, in the quarter before board review, was almost as valuable as delivery.
  
  After the call, the conference room emptied in layers. Sales fled to their next optimism. Leena gathered her laptop and looked at Maya with the expression of someone already writing a roadmap in her head.
  
  “We need an agent,” Leena said.
  
  Rafael Ortiz, who had remained seated specifically so he could disapprove from a lower altitude, folded his arms. “No. We need a harness.”
  
  Nia Okafor, three months into her first systems job, paused in the doorway. “What's the difference?”
  
  Rafael turned to the whiteboard as if the question had rescued the afternoon.
  
  “The model,” he said, drawing a rectangle, “is the part that predicts text well enough to seem intelligent. The harness is everything around it that makes it useful, bounded, inspectable, and safe.” He added boxes around the rectangle. “Tool access. State. prompts. retries. validation. logs. permissions. human approvals. tests. budgets. fallbacks. Without that, you don't have an agent. You have a talented intern with root access and no supervision.”
  
  Leena sat back down. “Fine. We need that.”
  
  Maya uncapped a marker. “Let's say the quiet part out loud. What business outcome are we actually chasing?”
  
  Leena answered immediately. “Reduce operations time on shipment exceptions by thirty percent. Keep response quality consistent. Make account managers stop improvising with spreadsheets.”
  
  Jonah Bell entered halfway through that sentence carrying a coffee and the permanently concerned look of Northstar's compliance and operations lead. “And do it in a way I can explain to auditors,” he added.
  
  Maya wrote on the board:
  
  1. Reduce exception handling time.
  2. Draft customer communications.
  3. Recommend refunds or escalations.
  4. Never take irreversible actions without policy.
  5. Preserve an audit trail.
  
  Then she drew a line beneath the list.
  
  “That's our first lesson,” she said, mostly to Nia, but really to the room. “We are not building an intelligent coworker. We are building a system that helps a business process. If we confuse the two, the model will happily role-play competence until it costs us money.”
  
  Rafael nodded. “Harness engineering begins when you stop asking, ‘How smart is the model?' and start asking, ‘What is the operating envelope of the whole system?'”
  
  ### Practical Lesson: Start from the process, not the magic
  
  When teams say they want an agent, they often mean one of three different things:
  
  - A chat interface that answers questions.
  - An assistant that drafts outputs for a human.
  - A system that can observe, decide, and act in a bounded workflow.
  
  Those require different harnesses. Before selecting prompts, tools, or models, define:
  
  - The business objective.
  - Which actions are reversible.
  - Which steps need human approval.
  - What evidence the system must cite.
  - How success and failure will be measured.
  
  Northstar did not need a theatrical bot. It needed a workflow system with language capabilities.
  
  That distinction would save them later.
  
  ## Chapter 2: The Whiteboard Contract
  
  The next morning, Maya booked a smaller room with no windows and a better table for argument. She invited only the people who would carry consequences: Leena for product, Rafael for engineering, Jonah for operations and governance, and Nia because she asked the kind of questions that made hidden assumptions visible.
  
  On the table sat printouts of actual shipment exception cases. Delayed rail transfer. Damaged pallet. Vendor sent replacement but forgot advance notice. Customer demanded refund after the item had already arrived. The cases were messy in the ordinary ways that business processes become messy when translated into software diagrams.
  
  Maya placed one case in the middle. “Walk me through what a human does.”
  
  Jonah tapped the page. “First they verify the shipment ID and customer account. Then they inspect status events, notes, and prior contact history. Then they classify the case—delay, damage, misroute, duplicate complaint, whatever. Then they decide whether the system can suggest a communication, a credit, or an escalation.”
  
  Rafael interrupted. “Important distinction: suggest, not perform.”
  
  Leena countered. “At first. If it works, we'll want more automation.”
  
  “At first and maybe permanently for some actions,” Jonah said. “No autonomous refunds over a threshold. No outbound messages without traceability. No claims decisions without source records.”
  
  Nia started writing categories in a notebook. “So the harness needs policy awareness?”
  
  “It needs policy enforcement,” Rafael said. “Awareness is what the model pretends to have. Enforcement is what the harness actually implements.”
  
  That sentence changed the tone of the meeting. It moved them from discussing personality to discussing architecture.
  
  They spent two hours turning vague ambition into a contract between business intent and system behavior.
  
  By noon, the whiteboard held a first design:
  
  **Input layer**
  - Case ID or customer request.
  - Relevant records pulled from shipment, CRM, and policy systems.
  - User role and authorization scope.
  
  **Reasoning layer**
  - The model proposes a classification, summarizes evidence, and suggests next steps.
  - The model must cite which records support each recommendation.
  
  **Control layer**
  - The harness decides which tools may be called.
  - The harness validates tool arguments.
  - The harness checks policies before action.
  - The harness can require human confirmation.
  
  **Action layer**
  - Draft email.
  - Create internal task.
  - Recommend credit.
  - Escalate to human queue.
  
  **Observation layer**
  - Log prompt version, retrieved context, tool calls, outputs, approvals, cost, latency, and final disposition.
  
  Maya took photos before anyone could erase the board.
  
  “This,” she said, “is the first artifact that matters. Not the prompt. The contract.”
  
  Nia looked up. “Because otherwise we don't know whether a failure belongs to the model or the harness?”
  
  “Exactly,” Rafael said. “If the model chooses a wrong class from good evidence, that's one problem. If the harness fed stale records, allowed the wrong tool, dropped a validation step, or hid uncertainty, that's another. Teams collapse these into ‘AI messed up' and learn nothing.”
  
  Leena pointed to the reasoning layer. “How much planning do we let it do?”
  
  Rafael drew two loops.
  
  “Loop one,” he said, “is small: inspect case, gather evidence, propose a disposition. Loop two is larger: if evidence is incomplete, request another tool call, then re-evaluate. The longer the loop, the more you need controls on retries, budgets, and allowed actions.”
  
  Jonah added a note: **Maximum autonomous steps: 3**.
  
  Maya smiled. “Good. We are designing a machine with edges.”
  
  ### Practical Lesson: Write the harness contract early
  
  A useful early artifact is a harness contract that names:
  
  - Inputs and trusted sources.
  - What the model is allowed to infer.
  - What the harness must verify.
  - What actions exist and who may approve them.
  - What must be logged for replay and audit.
  
  This prevents a common failure: asking the model to compensate for missing system design.
  
  ## Chapter 3: Tools With Locks on Them
  
  The team's first working prototype lived for six days before it embarrassed them.
  
  Rafael had wired up three tools:
  
  1. `get_shipment_case(case_id)`
  2. `lookup_policy(policy_code)`
  3. `draft_customer_email(template_type, facts)`
  
  Nia wrote fixtures and sample cases. Leena supplied representative scenarios. Maya insisted on a review queue so every recommendation would be seen by a human before use.
  
  On Thursday afternoon, they tested a damaged-goods complaint. The model correctly asked for case details, then policy guidance, then produced a tidy recommendation: offer a partial credit and draft an apology email.
  
  Leena clapped once. “That is a product.”
  
  Rafael, who never trusted a system immediately after success, swapped the case ID and tried a malformed request. The model attempted a policy lookup with a guessed code that did not exist, recovered with a generic apology, and still recommended a credit.
  
  Jonah frowned. “On what basis?”
  
  The log showed the answer: none. The model had inferred from similar cases that partial credit was common.
  
  “That,” Jonah said, “is exactly how a plausible assistant creates expensive folklore.”
  
  Rafael turned back to his editor. “Tool calls need stricter schemas. And recommendations need evidence requirements.”
  
  Nia leaned over his shoulder. “Can the harness force the model to provide fields like source record IDs?”
  
  “Yes,” he said. “Better: the harness can reject outputs that lack them.”
  
  By evening they had changed the flow. A recommendation object now required:
  
  - classification
  - confidence band
  - cited shipment events
  - cited policy reference
  - proposed action
  - human-approval flag
  - customer-safe explanation
  
  If any required evidence was missing, the harness would not allow the recommendation to advance. The model could ask for another retrieval step or return an explicit uncertainty state.
  
  The next morning, the prototype became less charming and more trustworthy.
  
  It also became slower.
  
  Leena noticed first. “Why did average case time jump from seven seconds to nineteen?”
  
  “Because quality has a shape,” Rafael said. “And one of its dimensions is latency.”
  
  Maya stepped in before the conversation became ideological. “Let's expose the tradeoff. Where is time being spent?”
  
  Nia pulled up traces. “Two retrieval calls, one failed tool call retry, one policy validation pass, one output schema check, and the model sometimes re-thinks after rejection.”
  
  Jonah said, “I prefer nineteen honest seconds to seven fraudulent ones.”
  
  Leena said, “Customers and agents may not.”
  
  Maya wrote another board note: **Fast enough, reliable enough, cheap enough. Never optimize one in isolation.**
  
  ### Practical Lesson: Tools are capabilities, not suggestions
  
  When giving a model tools, the harness should define:
  
  - Explicit schemas for arguments and outputs.
  - Permission boundaries by role and workflow stage.
  - What counts as sufficient evidence for an action.
  - Retry rules and failure handling.
  - Rejection paths when outputs are incomplete or unverifiable.
  
  A tool-enabled model should not be trusted simply because it can call functions. The harness must make correct use easier than confident improvisation.
  
  ## Chapter 4: Memory Is Where Bugs Go to Hide
  
  The first pilot customer was not the logistics firm from the demo. That deal had gone quiet, perhaps wisely. Instead, Northstar enrolled an internal operations team who processed its own shipment exceptions. If the system failed, it would fail close to home.
  
  For two weeks, the assistant performed well enough to earn a nickname. The operations agents called it Harbor.
  
  Harbor summarized cases. It drafted customer messages with fewer spelling disasters than the overnight team. It escalated edge cases instead of bluffing through them. Maya began to imagine a board slide with a graph that bent pleasingly downward under the title *Average Handling Time*.
  
  Then a supervisor named Elise forwarded an alarming example.
  
  A customer had written, upset about a delayed replacement order. Harbor's draft reply apologized for “the damage reported in your original shipment” and offered a partial credit policy that did not apply. The replacement order had not been damaged. A different order, six weeks earlier, had been.
  
  Nia found the cause before lunch.
  
  “The conversation memory included old case context from the same customer account,” she said. “The retrieval layer merged prior incidents because the account ID matched, and the summarizer compressed them into a narrative. The model wasn't hallucinating from nowhere. It was following contaminated context.”
  
  Rafael nodded grimly. “Classic harness bug. People will call it hallucination because that's easier than admitting state management is hard.”
  
  They reconstructed the path. Harbor maintained a rolling memory object for each open agent session to provide continuity across interactions. A well-intentioned optimization had stored “relevant prior issues” without strict scoping. When a new case came in under the same account, old facts rode along unless explicitly discarded.
  
  Jonah was unsparing. “If a human did this repeatedly, we'd call it using the wrong file.”
  
  Maya gathered the team around a screen.
  
  “What do we learn?” she asked.
  
  Nia answered first. “Memory should not be romanticized. It's cached context with liabilities.”
  
  Rafael almost smiled. “Write that down forever.”
  
  They redesigned state handling in three layers:
  
  1. **Session state** for the current interaction only.
  2. **Case memory** keyed to a specific case ID and versioned when records changed.
  3. **Reference history** retrieved deliberately, cited separately, and marked as prior context rather than current fact.
  
  They added freshness timestamps. They added provenance tags. They added a rule that any fact used in a customer-facing statement must come from current-case records unless the draft explicitly labeled it as historical context.
  
  Most importantly, they created a replay view that showed not just the final answer, but exactly which pieces of context had been assembled and in what order.
  
  When Elise re-ran the bad case through the updated system, Harbor refused to mention prior damage because no current evidence supported it.
  
  Leena exhaled. “Good. Now explain this in product language.”
  
  Maya answered. “The assistant should remember workflows, not smear facts across them.”
  
  ### Practical Lesson: Treat memory as data architecture
  
  In agentic systems, “memory” can mean many things:
  
  - Conversation transcript.
  - Cached intermediate state.
  - Long-term user or case attributes.
  - Retrieved historical examples.
  
  Each has different scoping, retention, and trust requirements. Practical safeguards include:
  
  - Separate current facts from historical context.
  - Version and timestamp state.
  - Show provenance for retrieved information.
  - Expire or reset memory aggressively where confusion is costly.
  - Build replay tools so engineers can inspect context assembly.
  
  Many apparent model failures are actually state hygiene failures.
  
  ## Chapter 5: The Budget Meeting
  
  By the start of the second month, Harbor had become respectable enough to attract a new enemy: finance.
  
  Maya arrived at the Tuesday operating review with a dashboard she thought looked triumphant. Case handling time was down 18 percent in the pilot queue. Draft acceptance rates were rising. Escalations were appropriately concentrated in complex cases.
  
  Then the CFO's analyst asked the question that always arrives after early success.
  
  “What is the unit cost per assisted case?”
  
  The room became interested in spreadsheets.
  
  Later that afternoon, Leena and Maya sat with Rafael and Nia in front of trace data. Jonah joined remotely, adding a layer of procedural gravity from a small square on the screen.
  
  Nia projected the breakdown.
  
  “Average assisted case,” she said, “uses 2.8 model calls, 1.7 shipment retrievals, 0.9 policy lookups, one draft generation, and occasional retries when validation fails. Complex cases cost three times more than simple ones.”
  
  Leena frowned. “Can we trim steps?”
  
  Rafael replied, “Yes, but every removed step increases either error, uncertainty, or manual burden. The question isn't ‘Can we make it cheaper?' It's ‘Where is rigor worth paying for?'”
  
  Jonah added, “And where is automation not worth doing at all.”
  
  They sorted case types into tiers.
  
  **Tier A: Low risk, high volume**
  - Delivery delays with clear status data.
  - Approved communication templates.
  - No financial adjustment above a low threshold.
  
  **Tier B: Moderate ambiguity**
  - Possible credits.
  - Multi-leg shipments.
  - Conflicting notes.
  
  **Tier C: High risk or poor evidence**
  - Claims, disputes, regulatory edge cases, repeated customer complaints.
  
  Rafael proposed a routing policy.
  
  - Tier A gets a compact reasoning path, minimal loop count, and aggressive template use.
  - Tier B gets full evidence gathering and mandatory human review.
  - Tier C skips automation beyond summarization and evidence packaging.
  
  Leena considered it. “So the harness chooses not just actions, but how much intelligence to spend.”
  
  “Exactly,” Maya said. “Budgeting is architecture.”
  
  They also implemented hard limits:
  
  - Maximum model calls per case.
  - Maximum wall-clock time before fallback.
  - Smaller model for classification, larger one only for complex drafting or conflict resolution.
  - Cached policy retrieval for common scenarios.
  
  Two weeks later, unit cost fell without a corresponding drop in quality. Not because the model got smarter, but because the harness learned triage.
  
  ### Practical Lesson: Budget by workflow tier
  
  Agentic systems need explicit cost and latency policies. Good patterns include:
  
  - Route simple work through smaller, shorter paths.
  - Reserve expensive reasoning for ambiguous or high-value cases.
  - Set per-task limits on calls, time, and retries.
  - Measure cost by successful business outcome, not by model invocation alone.
  - Prefer deterministic shortcuts where language reasoning adds little value.
  
  Cost discipline is part of harness design, not an afterthought.
  
  ## Chapter 6: The Night of the Stuck Queue
  
  The incident began at 8:14 p.m. on a Thursday when shipment exceptions stopped moving and no one noticed for eleven minutes because the dashboard was green.
  
  The queue processor had not crashed. That would have been merciful. Instead, Harbor's approval handoff tool was returning intermittent timeouts. The harness treated those timeouts as retriable. The model, seeing no confirmation, kept reformulating equivalent approval requests. Retries multiplied. Cases piled up. Latency climbed. The dashboard, averaging over too broad a window, remained cheerful.
  
  Maya was at home when Jonah called.
  
  “The system is not down,” he said in the clipped voice that meant the system was definitely down in a more subtle way. “It is politely drowning.”
  
  Within twenty minutes the team was online.
  
  Rafael shared logs. “We have a partial tool failure triggering a loop amplification problem.”
  
  Nia added, “And our trace IDs don't stitch the model retries cleanly to the queue events, so it's hard to see per-case impact.”
  
  Leena, less interested in taxonomy than in recovery, asked, “What do we do first?”
  
  Rafael answered without drama. “Stop autonomous retries. Route all pending approvals to manual review. Disable reformulation after two equivalent attempts. Put a circuit breaker in front of the approval tool.”
  
  They executed in that order.
  
  By 9:03 p.m., the queue was draining. By 9:40, they had the first timeline. By midnight, they had the post-incident outline.
  
  The next morning, Maya insisted they write the review as if it were for new engineers who would inherit the system after everyone in the room had changed jobs.
  
  The document identified four root issues:
  
  1. Tool timeouts were classified only as transient, not as potentially workflow-breaking.
  2. The agent loop had semantic retries but no equivalence detection, so it rephrased the same action request as if novelty might help.
  3. Observability emphasized aggregate health, not loop-level pathology.
  4. Fallback to manual processing existed but required too many human steps to activate quickly.
  
  Nia proposed a replay panel with “decision frames”: each model step, each tool call, each validation result, and the reason the loop continued or stopped.
  
  Jonah proposed a simpler escalation switch for operations.
  
  Leena proposed they stop calling the system “autonomous” in presentations.
  
  No one objected.
  
  ### Practical Lesson: Observe loops, not just uptime
  
  For agent harnesses, observability should include:
  
  - End-to-end traces per task.
  - Tool success and failure modes.
  - Loop counts and retry reasons.
  - Validation rejections.
  - Human escalations and fallback frequency.
  - Cost and latency distributions, not just averages.
  
  Partial failures are especially dangerous because they can create plausible but unproductive loops. Build circuit breakers, equivalence detection, and manual failover paths.
  
  ## Chapter 7: The Regression Trial
  
  Once Harbor stabilized, Leena wanted expansion. More queues. More customers. A better story for the board.
  
  Rafael said no for three consecutive meetings in three different ways.
  
  On the fourth, Maya asked him to explain in a sentence that did not sound like an engineer defending his self-esteem.
  
  He obliged.
  
  “Because if we change prompts, models, retrieval rules, or tool schemas without a standing evaluation harness, we will ship regressions wrapped in anecdotal excitement.”
  
  Leena held up both hands. “Fine. Build the evaluation harness. But make it useful, not ceremonial.”
  
  So they assembled a trial.
  
  Jonah contributed policy-sensitive edge cases. Nia mined historical exceptions and stripped sensitive details. Operations supervisors labeled good and bad outcomes. Maya required that each test case have not just an expected answer, but an expected process shape: which evidence should be gathered, whether human review should trigger, and what actions must never occur.
  
  Their evaluation suite scored Harbor across dimensions that mattered in the business:
  
  - Correct classification.
  - Evidence citation completeness.
  - Policy compliance.
  - Appropriate escalation.
  - Draft quality.
  - Cost per case.
  - Latency band.
  
  They also created adversarial cases:
  
  - Missing shipment IDs.
  - Contradictory notes.
  - Stale policy references.
  - Requests to “just approve it” without evidence.
  - Cases where doing nothing but escalating was the right answer.
  
  The first time they ran the suite against a seemingly improved prompt, overall draft tone went up while policy compliance dropped by four points.
  
  Leena stared at the report. “The demo version sounded better.”
  
  “Yes,” Rafael said. “Regression often has excellent bedside manner.”
  
  Maya turned to Nia. “What's the lesson?”
  
  Nia smiled, because by now she knew the rhythm of these meetings. “Evaluate the harness behavior you care about, not the vibes you notice first.”
  
  ### Practical Lesson: Build evaluation around real tasks
  
  Strong agent evaluations combine:
  
  - Historical cases.
  - Synthetic edge cases.
  - Explicit process expectations.
  - Safety and policy checks.
  - Cost and latency metrics.
  
  Evaluate full harness behavior, not just model output quality in isolation. A nicer answer can hide a worse system.
  
  ## Chapter 8: Who Gets to Say Yes
  
  The first external customer launch forced a question Northstar had postponed because it was uncomfortable rather than technically difficult: who held authority when the system crossed from recommendation to action?
  
  The customer, a mid-market distributor, wanted speed. Their operations director said it plainly.
  
  “If your assistant always waits for my staff, I haven't automated anything.”
  
  Jonah responded with equal plainness. “If it acts without controls, you haven't bought automation. You've bought a new category of incident.”
  
  Maya led the workshop that followed. On one side of the room sat customer operations managers. On the other sat Northstar engineers and lawyers. In the center was a projected matrix of actions:
  
  - Draft external communication.
  - Send external communication.
  - Issue low-value courtesy credit.
  - Issue high-value refund.
  - Reclassify case status.
  - Close case.
  - Escalate to specialist.
  
  For each action they defined:
  
  - Preconditions.
  - Required evidence.
  - Approval authority.
  - Logging requirements.
  - Reversal path.
  
  The surprising point of agreement came not around the riskiest actions, but around the reversible ones. Customers were willing to let Harbor draft, queue, and even send certain templated communications if every message included traceable references and if supervisors could audit samples. They were less willing to allow autonomous credits than some Northstar product managers had assumed.
  
  Leena revised the roadmap that evening. “We should productize approvals as a first-class feature, not as a temporary brake.”
  
  Rafael nodded. “A mature harness doesn't eliminate humans. It assigns them where judgment or accountability is cheapest and most valuable.”
  
  ### Practical Lesson: Human-in-the-loop is design, not defeat
  
  Use human approvals intentionally:
  
  - Require them for irreversible, high-risk, or weak-evidence actions.
  - Make approvals efficient with evidence bundles and clear diffs.
  - Log who approved what and why.
  - Revisit thresholds as evidence and trust improve.
  
  The goal is not maximal autonomy. The goal is appropriate delegation.
  
  ## Chapter 9: Change Control
  
  By winter, Harbor had become a real product, which meant it had acquired the least glamorous property of real products: version history.
  
  There were prompt versions, retrieval configurations, policy adapters, tool schema revisions, model upgrades, timeout settings, and escalation rules. Each change seemed small in isolation. Together they formed a moving system that could no longer be understood by memory and goodwill.
  
  The near-miss that finally forced discipline was almost comic.
  
  An engineer updated a policy formatting function to normalize reference codes. In doing so, he changed `CREDIT_LOW` to `credit-low` in one layer but not another. Harbor did not crash. It simply stopped recognizing a subset of low-value courtesy credit cases and escalated them all. Quality looked fine. Costs rose. Supervisors grumbled. Nobody knew why for two days.
  
  After that, Maya instituted a release council so lightweight nobody could accuse it of bureaucracy and so strict nobody could bypass it casually.
  
  Every harness-affecting change now required:
  
  - Linked evaluation results.
  - Named owner.
  - Rollback plan.
  - Changelog entry describing expected behavior differences.
  - Shadow or canary strategy for risky updates.
  
  Nia built a simple internal page where any case review could reveal the exact harness version that had produced it.
  
  Jonah called it “boring in the best possible way.”
  
  ### Practical Lesson: Treat the harness as a governed system
  
  Good change management for agentic systems includes:
  
  - Version everything that affects behavior.
  - Tie releases to evaluation results.
  - Use canaries or shadow tests for risky updates.
  - Make rollback easy.
  - Preserve case-level provenance for later investigation.
  
  Without change control, teams cannot distinguish innovation from drift.
  
  ## Chapter 10: The Board Slide and the Basement
  
  In March, Maya presented Harbor to the board.
  
  She did not show them a glowing chatbot.
  
  Instead she showed a process map. On the left: incoming shipment exceptions. In the middle: evidence retrieval, model reasoning, policy validation, approvals, and logging. On the right: outcomes, handling time reductions, quality bands, and escalation rates.
  
  She showed that low-risk cases moved faster. She showed that complex cases were surfaced with better summaries. She showed cost per assisted case, review rates, and incident trends. She showed that customer communications were more consistent, that supervisors spent less time on routine drafting, and that policy exceptions were easier to audit than before.
  
  Then one board member asked the question she had come to expect.
  
  “So how intelligent is it?”
  
  Maya smiled, because six months earlier that question would have trapped them into theater.
  
  “Intelligence is the least stable part of the story,” she said. “What we built is an operational harness that turns model capabilities into bounded business performance. When the model improves, the system benefits. When the model fails, the harness contains the damage. That's the asset.”
  
  In the back row, Leena nodded. Rafael looked faintly surprised to hear his worldview expressed in board-safe language. Jonah appeared relieved. Nia wrote the sentence down.
  
  That evening, long after the meeting, Maya went downstairs to the operations floor. The night team was working through exceptions. Harbor sat in its panel beside them, no longer magical enough to attract stares. It had become infrastructure.
  
  An agent opened a case, reviewed Harbor's evidence summary, accepted a draft reply with two edits, and sent it. Another case surfaced conflicting notes and Harbor recommended escalation. The supervisor approved. A third case timed out on retrieval and Harbor fell back gracefully, creating a manual task with the missing-data reason attached.
  
  Nothing in the room looked cinematic. Which, Maya thought, was exactly the point.
  
  Systems that matter eventually stop performing intelligence and start delivering reliability.
  
  Nia joined her by the railing. “Do you think we're done learning?”
  
  Maya laughed quietly. “No. The tools will change. The models will change. The failure modes will mutate. But the work stays recognizable.”
  
  Rafael, appearing from nowhere as skeptical engineers often do, added, “Every generation rediscovers the same lesson. If you want agents you can trust, engineer the harness harder than you admire the model.”
  
  Nia looked down at the floor where exceptions were being handled by humans with software assistance that no longer pretended to be a person.
  
  “That's a good ending,” she said.
  
  “It's not the ending,” Maya replied. “It's operations.”
  
  ## Epilogue: Notes from Northstar
  
  For the teams who came after, Northstar distilled Harbor's first year into a set of practical principles:
  
  1. **Define the workflow before the persona.** A business process is not improved by giving ambiguity a friendly name.
  2. **Separate model skill from harness responsibility.** Reasoning quality, context assembly, policy enforcement, and action control fail differently and should be measured differently.
  3. **Constrain tools with schemas, permissions, and validations.** Capability without control creates expensive improvisation.
  4. **Treat memory as scoped data, not as mystical continuity.** Most dangerous confusion enters through context assembly.
  5. **Budget intelligence.** Use richer loops where uncertainty justifies the cost.
  6. **Instrument for replay.** If you cannot reconstruct why the system acted, you cannot safely improve it.
  7. **Evaluate on real tasks and edge cases.** Charm is not compliance. Fluency is not correctness.
  8. **Design human approvals deliberately.** Accountability is part of the product.
  9. **Govern change.** Small configuration shifts can alter behavior more than major announcements do.
  10. **Aim for dependable operations, not theatrical autonomy.** The best agentic systems often look, from a distance, almost ordinary.
  
  That was the paradox Harbor taught them. The closer they got to a system the business could trust, the less they talked about magic. And the more value they created.

========================================================================
USER 7 / current pass (122 chars)
========================================================================

[tool_result] call_KQjMEvSeOlABUwQEUZuWTAke
ok: wrote 32256 chars to manuscript.md; now 614 lines, 4920 words, 32664 bytes

========================================================================
ASSISTANT 8 / current pass (153 chars)
========================================================================

Done — drafted the novelized teaching manuscript in `manuscript.md` and recorded durable intent, structure, cast, topics, and open issues in `memory.md`.

========================================================================
USER 9 / current pass (2357 chars)
========================================================================

<reminder>Revise manuscript.md if useful.</reminder>

<filesystem>
  <file path="manuscript.md" bytes="32664" words="4920" lines="614" headings="21">
    <heading line="1" level="1">The Harness Line</heading>
    <heading line="3" level="2">Chapter 1: The Demo That Lied</heading>
    <heading line="59" level="3">Practical Lesson: Start from the process, not the magic</heading>
    <heading line="79" level="2">Chapter 2: The Whiteboard Contract</heading>
    <heading line="147" level="3">Practical Lesson: Write the harness contract early</heading>
    <heading line="159" level="2">Chapter 3: Tools With Locks on Them</heading>
    <heading line="219" level="3">Practical Lesson: Tools are capabilities, not suggestions</heading>
    <heading line="231" level="2">Chapter 4: Memory Is Where Bugs Go to Hide</heading>
    <heading line="277" level="3">Practical Lesson: Treat memory as data architecture</heading>
    <heading line="296" level="2">Chapter 5: The Budget Meeting</heading>
    <heading line="354" level="3">Practical Lesson: Budget by workflow tier</heading>
    <heading line="366" level="2">Chapter 6: The Night of the Stuck Queue</heading>
    <heading line="407" level="3">Practical Lesson: Observe loops, not just uptime</heading>
    <heading line="420" level="2">Chapter 7: The Regression Trial</heading>
    <heading line="466" level="3">Practical Lesson: Build evaluation around real tasks</heading>
    <heading line="478" level="2">Chapter 8: Who Gets to Say Yes</heading>
    <heading line="512" level="3">Practical Lesson: Human-in-the-loop is design, not defeat</heading>
    <heading line="523" level="2">Chapter 9: Change Control</heading>
    <heading line="547" level="3">Practical Lesson: Treat the harness as a governed system</heading>
    <heading line="559" level="2">Chapter 10: The Board Slide and the Basement</heading>
    <heading line="599" level="2">Epilogue: Notes from Northstar</heading>
  </file>
  <file path="memory.md" bytes="1744" words="246" lines="34" headings="5">
    <heading line="1" level="1">Durable intent</heading>
    <heading line="7" level="1">Working structure</heading>
    <heading line="12" level="1">Candidate cast</heading>
    <heading line="19" level="1">Core topics to weave into incidents</heading>
    <heading line="31" level="1">Open issues</heading>
  </file>
</filesystem>

========================================================================
ASSISTANT 10 / current pass (97 chars)
========================================================================

[tool_use] read
path: "manuscript.md"
startLine: 1
endLine: 120
[tool_use] read
path: "memory.md"

========================================================================
USER 11 / current pass (8903 chars)
========================================================================

[tool_result] call_MTykHJ628RAflP3ZqJeJE9F9
[lines 1-120 of 614]
# The Harness Line

## Chapter 1: The Demo That Lied

On the Monday that changed everything, Maya Chen stood at the front of the fourth-floor conference room and watched a sales engineer promise an impossible future.

The screen on the wall showed a chat interface branded as if it were already a product. A prospect from a regional logistics firm had asked whether Northstar Systems could automate exception handling for delayed shipments, vendor emails, and refund approvals. The sales engineer, smiling with the confidence of someone borrowing certainty from a prototype, typed:

> Resolve all late-shipment cases from last week and draft customer outreach.

The assistant responded with a smooth paragraph about reviewing records, categorizing cases, generating communications, and escalating edge cases. It sounded calm. Competent. Expensive.

The prospect leaned forward. “Can it actually do that?”

For one half-second, nobody spoke.

Leena Park, Northstar's product lead, answered first. “It can with the right integration path.”

That sentence was technically true in the way a bridge is technically possible before anyone surveys the river.

Maya knew what the system really was: a language model with a prompt, two brittle internal tools, and a habit of sounding more completed than it was. It could summarize shipment notes. It could draft emails if someone pasted data into the right format. It could not, under any defensible definition of the word, resolve all late-shipment cases.

But the prospect heard possibility, and possibility, in the quarter before board review, was almost as valuable as delivery.

After the call, the conference room emptied in layers. Sales fled to their next optimism. Leena gathered her laptop and looked at Maya with the expression of someone already writing a roadmap in her head.

“We need an agent,” Leena said.

Rafael Ortiz, who had remained seated specifically so he could disapprove from a lower altitude, folded his arms. “No. We need a harness.”

Nia Okafor, three months into her first systems job, paused in the doorway. “What's the difference?”

Rafael turned to the whiteboard as if the question had rescued the afternoon.

“The model,” he said, drawing a rectangle, “is the part that predicts text well enough to seem intelligent. The harness is everything around it that makes it useful, bounded, inspectable, and safe.” He added boxes around the rectangle. “Tool access. State. prompts. retries. validation. logs. permissions. human approvals. tests. budgets. fallbacks. Without that, you don't have an agent. You have a talented intern with root access and no supervision.”

Leena sat back down. “Fine. We need that.”

Maya uncapped a marker. “Let's say the quiet part out loud. What business outcome are we actually chasing?”

Leena answered immediately. “Reduce operations time on shipment exceptions by thirty percent. Keep response quality consistent. Make account managers stop improvising with spreadsheets.”

Jonah Bell entered halfway through that sentence carrying a coffee and the permanently concerned look of Northstar's compliance and operations lead. “And do it in a way I can explain to auditors,” he added.

Maya wrote on the board:

1. Reduce exception handling time.
2. Draft customer communications.
3. Recommend refunds or escalations.
4. Never take irreversible actions without policy.
5. Preserve an audit trail.

Then she drew a line beneath the list.

“That's our first lesson,” she said, mostly to Nia, but really to the room. “We are not building an intelligent coworker. We are building a system that helps a business process. If we confuse the two, the model will happily role-play competence until it costs us money.”

Rafael nodded. “Harness engineering begins when you stop asking, ‘How smart is the model?' and start asking, ‘What is the operating envelope of the whole system?'”

### Practical Lesson: Start from the process, not the magic

When teams say they want an agent, they often mean one of three different things:

- A chat interface that answers questions.
- An assistant that drafts outputs for a human.
- A system that can observe, decide, and act in a bounded workflow.

Those require different harnesses. Before selecting prompts, tools, or models, define:

- The business objective.
- Which actions are reversible.
- Which steps need human approval.
- What evidence the system must cite.
- How success and failure will be measured.

Northstar did not need a theatrical bot. It needed a workflow system with language capabilities.

That distinction would save them later.

## Chapter 2: The Whiteboard Contract

The next morning, Maya booked a smaller room with no windows and a better table for argument. She invited only the people who would carry consequences: Leena for product, Rafael for engineering, Jonah for operations and governance, and Nia because she asked the kind of questions that made hidden assumptions visible.

On the table sat printouts of actual shipment exception cases. Delayed rail transfer. Damaged pallet. Vendor sent replacement but forgot advance notice. Customer demanded refund after the item had already arrived. The cases were messy in the ordinary ways that business processes become messy when translated into software diagrams.

Maya placed one case in the middle. “Walk me through what a human does.”

Jonah tapped the page. “First they verify the shipment ID and customer account. Then they inspect status events, notes, and prior contact history. Then they classify the case—delay, damage, misroute, duplicate complaint, whatever. Then they decide whether the system can suggest a communication, a credit, or an escalation.”

Rafael interrupted. “Important distinction: suggest, not perform.”

Leena countered. “At first. If it works, we'll want more automation.”

“At first and maybe permanently for some actions,” Jonah said. “No autonomous refunds over a threshold. No outbound messages without traceability. No claims decisions without source records.”

Nia started writing categories in a notebook. “So the harness needs policy awareness?”

“It needs policy enforcement,” Rafael said. “Awareness is what the model pretends to have. Enforcement is what the harness actually implements.”

That sentence changed the tone of the meeting. It moved them from discussing personality to discussing architecture.

They spent two hours turning vague ambition into a contract between business intent and system behavior.

By noon, the whiteboard held a first design:

**Input layer**
- Case ID or customer request.
- Relevant records pulled from shipment, CRM, and policy systems.
- User role and authorization scope.

**Reasoning layer**
- The model proposes a classification, summarizes evidence, and suggests next steps.
- The model must cite which records support each recommendation.

**Control layer**
- The harness decides which tools may be called.
- The harness validates tool arguments.
- The harness checks policies before action.
- The harness can require human confirmation.

**Action layer**
[tool_result] call_HsLQOLngQo4BFgs50D33gaHV
# Durable intent
- Write a didactic novel/scenario-driven narrative that teaches agentic harness engineering.
- Use a business-and-technical learning story structure.
- Include recurring characters, concrete incidents, and practical lessons.
- Do not imitate any specific author's prose.

# Working structure
- Form: accessible novelistic narrative with chapter-like sections.
- Throughline: a team at a company learns to build, debug, govern, and scale an agent harness in production.
- Educational goal: each chapter dramatizes one harness engineering concern and extracts practical lessons.

# Candidate cast
- Maya Chen: newly promoted engineering manager, bridges business pressure and technical ambiguity.
- Rafael Ortiz: staff engineer, skeptical, strong on systems and failure analysis.
- Leena Park: product lead, focused on customer outcomes and deadlines.
- Jonah Bell: operations/compliance lead, worries about auditability, safety, and cost.
- Nia Okafor: junior engineer/analyst, asks clarifying questions that surface teaching moments.

# Core topics to weave into incidents
- Defining harness vs model behavior.
- Tool routing and permissions.
- Context assembly and memory.
- Planning vs acting loops.
- Evaluation and regression testing.
- Cost/latency budgeting.
- Human-in-the-loop escalation.
- Observability, logs, and replay.
- Failure modes: hallucinated actions, partial tool failures, stale memory, prompt drift.
- Governance and change management.

# Open issues
- Decide chapter count and level of realism versus overt didactic explanation.
- Need a strong opening incident that makes harness engineering feel necessary, not abstract.
- Need a satisfying ending with business impact and mature engineering practices.

========================================================================
ASSISTANT 12 / current pass (764 chars)
========================================================================

[tool_use] patch
path: "memory.md"
find (268 chars):
  # Open issues
  - Decide chapter count and level of realism versus overt didactic explanation.
  - Need a strong opening incident that makes harness engineering feel necessary, not abstract.
  - Need a satisfying ending with business impact and mature engineering practices.
replace (403 chars):
  # Open issues
  - Draft complete at 10 chapters plus epilogue.
  - Consider one revision pass to sharpen the novelistic connective tissue and reduce repeated didactic cadence.
  - Possible enhancement: add a brief interchapter thread showing the pilot customer or ops supervisor perspective more directly.
  - Possible enhancement: tighten some lesson sections so they vary more in form while staying practical.

========================================================================
USER 13 / current pass (132 chars)
========================================================================

[tool_result] call_asHnt31FGNzT7DmrTISA8PEa
ok: patched memory.md (replaced 268 chars with 403); now 35 lines, 266 words, 1879 bytes

========================================================================
ASSISTANT 14 / current pass (1048 chars)
========================================================================

[tool_use] patch
path: "manuscript.md"
find (313 chars):
  The first external customer launch forced a question Northstar had postponed because it was uncomfortable rather than technically difficult: who held authority when the system crossed from recommendation to action?
  
  The customer, a mid-market distributor, wanted speed. Their operations director said it plainly.
  
replace (639 chars):
  The first external customer launch forced a question Northstar had postponed because it was uncomfortable rather than technically difficult: who held authority when the system crossed from recommendation to action?
  
  Until then, most of Harbor's mistakes had been Northstar's own problem. An awkward draft could be discarded. A bad recommendation could be corrected internally. But an external launch changed the moral geometry of the room. Failure would now travel into another company's workflow wearing the borrowed authority of software.
  
  The customer, a mid-market distributor, wanted speed. Their operations director said it plainly.

========================================================================
USER 15 / current pass (139 chars)
========================================================================

[tool_result] call_bUXIhQrQ4qUrrhAckKeWwZX8
ok: patched manuscript.md (replaced 313 chars with 639); now 616 lines, 4969 words, 32990 bytes

========================================================================
ASSISTANT 16 / current pass (1217 chars)
========================================================================

[tool_use] patch
path: "manuscript.md"
find (416 chars):
  In the back row, Leena nodded. Rafael looked faintly surprised to hear his worldview expressed in board-safe language. Jonah appeared relieved. Nia wrote the sentence down.
  
  That evening, long after the meeting, Maya went downstairs to the operations floor. The night team was working through exceptions. Harbor sat in its panel beside them, no longer magical enough to attract stares. It had become infrastructure.
  
replace (705 chars):
  In the back row, Leena nodded. Rafael looked faintly surprised to hear his worldview expressed in board-safe language. Jonah appeared relieved. Nia wrote the sentence down.
  
  The board approved the expansion budget. Sales would get its story. Product would get time to harden approvals. Operations would get staffing for the queues that still needed human judgment. It was, Maya thought, the rare corporate decision that rewarded reality instead of punishing it.
  
  That evening, long after the meeting, Maya went downstairs to the operations floor. The night team was working through exceptions. Harbor sat in its panel beside them, no longer magical enough to attract stares. It had become infrastructure.

========================================================================
USER 17 / current pass (139 chars)
========================================================================

[tool_result] call_j2LiSzx2j6Akqf7jyIS8RVvz
ok: patched manuscript.md (replaced 416 chars with 705); now 618 lines, 5014 words, 33279 bytes

========================================================================
ASSISTANT 18 / current pass (179 chars)
========================================================================

Revised `manuscript.md` lightly to strengthen connective tissue in the later chapters and updated `memory.md` to reflect current draft status and remaining revision opportunities.

========================================================================
TURN TELEMETRY
========================================================================

turn 1: request 2905 chars (system 443 / tools 1959 / messages 503); responseTextChars 0; toolCalls 2
turn 2: request 3358 chars (system 443 / tools 1959 / messages 956); responseTextChars 0; toolCalls 1
turn 3: request 5506 chars (system 443 / tools 1959 / messages 3104); responseTextChars 0; toolCalls 1
turn 4: request 39338 chars (system 443 / tools 1959 / messages 36936); responseTextChars 153; toolCalls 0
turn 5: request 42068 chars (system 443 / tools 1959 / messages 39666); responseTextChars 0; toolCalls 2
turn 6: request 51520 chars (system 443 / tools 1959 / messages 49118); responseTextChars 0; toolCalls 1
turn 7: request 52575 chars (system 443 / tools 1959 / messages 50173); responseTextChars 0; toolCalls 1
turn 8: request 53924 chars (system 443 / tools 1959 / messages 51522); responseTextChars 0; toolCalls 1
turn 9: request 55442 chars (system 443 / tools 1959 / messages 53040); responseTextChars 179; toolCalls 0
