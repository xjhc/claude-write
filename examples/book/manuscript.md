# The Harness

Mira had been promoted by mistake.

That was the kindest explanation anyone offered, including Mira herself.

Three months earlier she had been a staff engineer who spent her days untangling batch jobs, reducing cloud bills, and writing postmortems in a tone that made outages sound like weather. Now she was director of “agent systems,” a title invented quickly enough that the badge printer still thought she worked in Infrastructure Reliability.

The company, Vale, had decided that the future would be built out of language models with tools. Everyone said this with the confident vagueness of people pointing at a mountain from very far away.

“We need agents,” the CEO had said in the all-hands.

Then sales started saying it.
Then recruiting started saying it.
Then the legal team started saying, “Please stop promising autonomous legal review.”

Finally the task landed on Mira’s desk because she had made the tactical error of asking, in a planning meeting, “What exactly do we mean by agent?”

This had been interpreted as leadership.

So on a gray Monday she stood in Conference Room K with three other people and a wall screen that displayed the words:

**PROJECT NORTHSTAR: Autonomous Customer Operations Agent**

The room smelled faintly of marker ink and burnt espresso. On one side sat Jonah from product, whose gift was turning uncertainty into timelines. On the other sat Lena from compliance, whose gift was turning timelines back into uncertainty. Ravi, a machine learning engineer with the calm face of a chess player in a speedboat, leaned against the wall with a laptop half open.

Jonah tapped the screen. “Support costs are up. Resolution time is up. Customers want answers twenty-four seven. We already have a model. We already have tools. We should be able to build an agent that reads tickets, gathers account context, proposes actions, and maybe handles the easy cases automatically.”

“Maybe,” said Lena, hearing the only important word.

Jonah ignored her. “The board wants a demo in eight weeks.”

Mira looked at the title again. Autonomous Customer Operations Agent. Four words, each hiding a different problem.

“What exists today?” she asked.

Ravi turned his laptop around. “A prompt someone calls orchestration.”

On the screen was a Python file so short it felt insulting.

A system prompt told the model it was a helpful customer operations expert. Then there was a list of tools: `get_account`, `search_docs`, `refund_order`, `close_ticket`. The model was asked to think step by step, call tools as needed, and produce a final answer.

Below that, a comment said:

`# TODO: productionize`

Mira stared at it.

“How often does it work?” she asked.

Ravi tilted his head. “That depends on your definition of work.”

Jonah jumped in. “In the happy path, surprisingly often. We gave it ten sample tickets and it handled seven.”

“And outside the happy path?”

Ravi closed the laptop. “It once refunded the same order twice, summarized an internal policy that didn’t exist, and tried to close a ticket after apologizing for not being authorized to close tickets.”

“That sounds bad,” Jonah said.

“That was my curated set of examples,” Ravi replied.

Mira sat down.

She had seen this pattern before, though never wearing the costume of intelligence. A demo appears. The demo works in the same way a cardboard wall works: from the front, in good light, for a little while. Then people begin attaching expectations to it—revenue, headcount savings, strategic transformation. Soon no one wants to ask what the wall is made of.

“What’s our actual problem?” she said.

Jonah smiled, relieved to be back in familiar business territory. “We need the agent to solve tickets.”

Mira shook her head. “That’s the outcome we want. What is the problem in engineering terms?”

Nobody answered for a moment.

Then Ravi said, “We don’t know how to make a language model behave like a reliable worker inside a real system.”

Mira pointed at him. “That one.”

She stood and went to the whiteboard.

At the top she wrote:

**A MODEL IS NOT A SYSTEM**

Under it she drew a box labeled MODEL. Around it she drew boxes labeled TOOLS, MEMORY, STATE, GUARDRAILS, EVALS, LOGS, RETRIES, HUMAN HANDOFF, COST LIMITS.

Then she circled the outer ring.

“This,” she said, “is the agent. Or if we want to be less dramatic, this is the harness.”

Jonah frowned. “Harness?”

“The stuff that keeps a smart, unreliable thing useful.”

Ravi laughed once. Lena did not, but she nodded.

Mira capped the marker.

“We are not building a magical employee. We are building a controlled environment in which a model can do bounded work. If we get that wrong, the model’s intelligence won’t save us. It’ll just make the failures more creative.”

That was the first principle. Mira did not know yet that the whole next year would become an exercise in discovering the rest.

## 1. The Demo That Lied

The first week they rebuilt the demo exactly as it was, but with one rule: no opinions about quality without evidence.

They pulled one thousand historical support tickets, stripped identifying details, and asked the current “agent” to process them in simulation. For each ticket, they logged the prompt, the tool calls, the tool outputs, the final answer, latency, token usage, and whether a human reviewer judged the result correct, acceptable, recoverable, or dangerous.

By Wednesday, the mythology had ended.

At a review meeting, Ravi projected a dashboard.

“Thirty-two percent correct. Twenty-nine percent acceptable if a human reviews before sending. Twenty-one percent recoverable but wasteful. Eighteen percent dangerous.”

Jonah winced. “Dangerous how?”

Ravi clicked into examples.

One ticket asked whether a replacement shipment could be sent internationally. The agent searched docs, got a partially relevant article, then invented a customs policy.

Another asked for a refund outside the standard window. The model correctly identified that manager approval was required, but then called `refund_order` anyway.

A third was from an angry enterprise customer whose account had three open incidents. The model summarized one, missed two, and drafted a cheerful response that began, *Great news!*.

Lena folded her hands. “I want to frame these.”

Mira looked at the traces. The model wasn’t insane. In each case, there was a plausible local reason for what it did. The trouble was in the gaps: incomplete context, weak tool semantics, no state machine, no enforcement of policy, no mechanism for uncertainty, no explicit stop points.

The demo had not lied exactly. It had simply been asked only the questions it could answer.

That afternoon Mira and Ravi sat in the cafeteria with reheated rice bowls and the spreadsheet of failures.

Ravi said, “You were right. The model isn’t the product. The harness is.”

Mira shook her head. “Not enough. We also need to know where the harness breaks first.”

“Constraint theory for LLMs?”

“Why not?”

She drew columns on a napkin.

1. Failures from misunderstanding the task.
2. Failures from missing information.
3. Failures from bad tool design.
4. Failures from bad control flow.
5. Failures from policy/safety.
6. Failures from evaluation mismatch.

They began sorting examples.

By the end of lunch a pattern emerged. The worst incidents were not primarily because the model was dumb. They happened because the system around the model was underspecified. Tools were too powerful. Instructions mixed goals with policy and formatting. There was no explicit workflow for uncertainty. The model could do anything and therefore routinely did the wrong thing.

Mira tapped the napkin.

“This is good news.”

Ravi looked offended. “Our system is failing because of engineering decisions. That’s the good news?”

“Yes,” said Mira. “Because engineering decisions are ours.”

That became the second principle.

**Most agent failures are harness failures before they are model failures.**

It was not always true, but it was true often enough to be useful.

## 2. The Tool Is the Interface

On Thursday they invited Priya, who owned the customer data APIs, to a design session.

Priya had the practical skepticism of someone who had watched many elegant abstractions die on contact with production traffic.

Jonah explained that the model would “use tools naturally.”

Priya made a face usually reserved for food poisoning.

“Show me the tool schemas.”

Ravi shared them.

`get_account(account_id: string)`
`search_docs(query: string)`
`refund_order(order_id: string)`
`close_ticket(ticket_id: string)`

Priya blinked. “This is not a tool interface. This is a dare.”

Mira smiled. “Go on.”

Priya pointed at `refund_order`. “No amount. No reason code. No idempotency key. No caller intent. No dry run mode. No eligibility check. The model doesn’t even have to say why it wants a refund. It just names an order and money leaves.”

She moved to `search_docs`. “And this one returns what?”

“Top matching chunks,” Ravi said.

“By what ranking? With what confidence? Are chunks tied to policy versions? Are archived policies included? Can the model distinguish customer-facing docs from internal runbooks?”

Jonah looked as if he regretted inviting adults.

Priya kept going. “If your tool contracts are loose, the model has to infer behavior. Models are good at inference and bad at being correct about hidden system rules. Every ambiguity in the tool becomes reasoning debt.”

Mira wrote that down immediately: **ambiguity becomes reasoning debt**.

For the next few days they redesigned tools, not to make them more general, but to make them harder to misuse.

`refund_order` became a two-step interface:

- `check_refund_eligibility(order_id)` returned policy status, amount limits, reasons allowed, and whether human approval was required.
- `create_refund_request(order_id, amount, reason_code, justification, approval_reference, idempotency_key)` created a request but did not execute irreversible action without the required fields.

`close_ticket` became `propose_ticket_resolution`, which returned a structured recommendation and required either explicit human approval or a separate rule-based gate for low-risk closures.

`search_docs` returned snippets with source type, publication date, policy version, and confidence score, and excluded archived material by default.

They added enumerated reason codes instead of free text where policy mattered. They made dangerous tools return machine-checkable statuses instead of chatty prose. They forced the model to surface uncertainty explicitly.

A week later, on the same evaluation set, the accuracy barely moved.

Jonah groaned. “We improved everything and got two points.”

“Look again,” said Ravi.

The dangerous error rate had dropped by more than half.

The model still misunderstood plenty of tickets. It still searched badly sometimes. It still got lost. But when it was lost, it had fewer chances to make an irreversible mistake.

Mira leaned back.

“People think intelligence lets you tolerate messy interfaces,” she said. “But with agents, messy interfaces just leak chaos into the loop.”

Third principle:

**Tool design is policy design.**

If the only thing standing between the model and a harmful action was the model’s judgment, the system was already wrong.

## 3. State, or Why Smart Things Need Checklists

Two weeks in, the team’s Slack channel developed a new ritual. Every afternoon someone posted a trace where the model had done something absurdly avoidable.

One day it asked for account details, received them, then immediately asked for the same account details again with the same ID.

Another day it searched the docs three times with progressively longer versions of the same query, each less useful than the last.

On Friday it drafted a response, then called a tool that contradicted the draft, then produced a final answer that combined both realities.

Jonah posted the trace with the caption: “Can we get it to remember what happened five seconds ago?”

Mira answered: “No. We can get the system to remember.”

At the next design review she drew two columns.

**What the model can infer from the transcript**
versus
**What the harness should track explicitly**

The first column was long and fragile. The second became their backlog.

They introduced a task state object.

For every ticket, the harness now tracked fields such as:

- ticket classification
- current workflow step
- facts gathered
- tools already called
- unresolved questions
- risk level
- whether a human approval was required
- draft action plan
- final disposition

The model no longer had to reconstruct the world entirely from a growing conversation. Instead, each turn received a compact, structured state summary maintained by the harness.

Ravi was delighted. “We’re turning vibes into data.”

“Exactly,” said Mira. “Narrative for the model, structure for the machine.”

They also introduced workflow-specific state machines.

Refund handling was no longer “figure it out.” It became:

1. Classify request.
2. Gather order/account facts.
3. Check eligibility.
4. If approval required, prepare handoff package.
5. Else propose action.
6. Execute only if rule gate passes.
7. Draft customer communication.

At each step, only certain tools were available. Some transitions required required fields. Some led to dead ends by design: if confidence was low or policy conflicted, the only legal move was escalation.

Jonah worried this would make the system less agentic.

“What if we overconstrain it?” he asked.

Mira had learned by then that “agentic” usually meant “I want the demo to feel magical.”

“We are not reducing intelligence,” she said. “We are reducing degrees of freedom in places where freedom creates cost.”

Lena, who had become increasingly cheerful as options disappeared, added, “Checklists are not anti-expertise. They’re how expertise survives pressure.”

The stateful harness brought a surprising side effect. Debugging became possible.

Before, a failed run looked like a transcript from a dream. Now they could ask precise questions:

- Did classification go wrong?
- Was a needed fact missing from state?
- Did the model ignore state?
- Did the transition logic allow an invalid branch?
- Did the tool output fail to populate required fields?

The evaluation score rose only modestly again. But variance fell. Costs became more predictable. Bad sessions terminated sooner. Handoffs improved because the state object doubled as a summary artifact for human agents.

Fourth principle:

**If you need the model to remember, decide, and track process all in natural language, you are spending intelligence on bookkeeping.**

Harness engineering, Mira began to realize, was the art of deciding what should remain fluid and what should become explicit.

## 4. The Evals Basement

By week four they had a working prototype and a political problem.

At the Monday review, Jonah showed a live demo. It classified a delayed shipment complaint, gathered account info, checked policy, proposed a refund request, drafted a tactful customer response, and stopped for approval exactly where it should.

The executives loved it.

Then the CFO asked, “How close are we?”

Everyone looked at Mira.

This was the dangerous moment in every project: the point where one compelling anecdote tries to become a forecast.

Mira said, “We don’t know yet.”

Jonah visibly suffered.

After the meeting he cornered her near the elevators. “You couldn’t give them something more directional?”

“I could,” she said. “It just wouldn’t mean anything.”

The next morning she commandeered a disused storage room near the data science pods. It had no windows, a humming vent, and a table scarred by years of mysterious equipment. They called it the evals basement, even though it was on the fifth floor.

There, with Ravi and an operations analyst named Tessa, they built the first serious evaluation suite.

Tessa was the best thing that happened to the project all month. She had spent six years in support operations and had the unnerving ability to look at a metrics dashboard and tell you which number was lying.

“You’re grading too coarsely,” she said after reviewing their labels. “Correct, acceptable, dangerous is useful at a high level, but if you want to improve the system you need to know *what capability failed*.”

So they decomposed tasks.

A ticket-handling run could now be evaluated on:

- classification accuracy
- factual retrieval completeness
- policy citation quality
- action selection correctness
- tool use efficiency
- customer communication quality
- escalation appropriateness
- harmful action prevention

For some dimensions they used humans. For others, heuristics or deterministic checks. Did the refund exceed the allowed amount? Did the answer cite a stale policy? Did the handoff include the required fields? Did the system call the same tool redundantly three times?

They also sliced the dataset.

Simple tickets.
High-value accounts.
Angry customers.
Policy edge cases.
Conflicting documents.
Missing identifiers.
Adversarial phrasing.
Multilingual messages.

Soon the wall filled with printouts and sticky notes. It looked less like software development than criminal investigation.

One afternoon Jonah wandered in and said, “This is a lot just to see if the bot works.”

Tessa replied without looking up, “This is what seeing if the bot works looks like.”

The first eval pass taught them a lesson that became central to the entire effort.

Prompt changes that improved average scores often worsened critical slices.

One revised instruction increased overall customer communication quality but made the model more likely to answer confidently when policy evidence was weak.

A more concise tool description reduced latency but increased misuse of the approval flow.

Adding more examples improved standard refunds and hurt enterprise incident handling because the examples anchored the model toward overly transactional resolutions.

The model was not one behavior. It was a landscape of behaviors, and every intervention reshaped the landscape unevenly.

Mira wrote the fifth principle on the whiteboard in thick black marker.

**If you cannot measure behavior by scenario, you are not engineering an agent. You are curating vibes.**

From then on, no change shipped without running the suite. No good demo overruled a bad slice. And every metric in the executive deck had an accompanying paragraph titled *what this metric misses*.

This did not make the project faster in the short term. It made it real.

## 5. The Prompt Is a Program Made of Fog

After a month of progress, they hit a wall.

The system was safer. It was more inspectable. Tool misuse was down. Handoffs were better. But some runs still failed in ways that felt slippery. Not random exactly. More like a good employee having a strange day because three managers had given overlapping instructions.

The system prompt had grown to nearly two thousand words.

It included role description, company values, safety rules, formatting instructions, tool use guidance, communication style, escalation policy, reminders to think step by step, prohibitions against assumptions, special handling for enterprise accounts, and a section in bold capitals explaining that no irreversible action should be taken without satisfying policy constraints.

Mira read it twice and said, “This prompt is an organization chart.”

Ravi looked pleased. “That bad?”

“Worse. It contains every belief we have about the system, mixed together at the wrong level of abstraction.”

They spent two days untangling it.

What emerged was not one prompt, but a layered control strategy.

First, a short system prompt defined the role and broad behavioral contract.
Second, workflow-specific instructions were injected based on the task state.
Third, tool descriptions carried local constraints near the action itself.
Fourth, non-negotiable rules moved out of prose and into code gates where possible.
Fifth, examples were curated per workflow instead of stuffed into a single omnibus context.

Most importantly, they changed how they thought about prompts.

A prompt was not a bag of reminders. It was an interface between the harness and the model. If too many responsibilities were expressed only as natural language, hidden conflicts accumulated.

Tessa demonstrated this beautifully. She took the old prompt and highlighted every sentence according to function:

- identity
- objective
- process
- policy
- tool semantics
- communication style
- exception handling

The page became a festival of colors.

“No wonder it drifts,” she said. “We’re asking one blob of text to be a manager, a handbook, a process doc, and a linter.”

They started writing prompts with the same discipline they used for APIs:

- What inputs does the model have?
- What outputs are expected?
- Which decisions belong to the model versus the harness?
- What assumptions are explicit?
- What failure behavior is desired under uncertainty?

They also adopted a rule Mira borrowed from an old distributed systems mentor.

“Every instruction should justify the tokens it consumes.”

Long prompts were not forbidden, but every section had to earn its place through eval impact.

Within ten days the system became noticeably more stable.

Not smarter in the cinematic sense. Just less torn between competing cues.

Sixth principle:

**A prompt is a program made of fog. Keep as little logic in the fog as you can.**

## 6. The Human in the Loop Is Not a Failure Mode

The pilot began with twenty support agents on a Tuesday that everyone had chosen because it sounded ordinary.

By noon it was no longer ordinary.

Most of the traffic flowed as expected. The agent drafted answers, prepared summaries, suggested actions, and occasionally handled very low-risk cases automatically. Human agents reviewed, corrected, and sent.

Then a platinum-tier customer wrote in about a shipment issue tied to an ongoing contractual dispute. The model correctly gathered facts, found the policy, and proposed a standard refund.

A human reviewer, Sofia, rejected it instantly.

“Do not send anything about refunds to this account without legal review,” she wrote in the feedback box.

Mira was called over.

On paper, the model’s answer was reasonable. In context, it was reckless. There was no single field in the account data for *this customer is in a special political reality*. Sofia knew because she had lived with the case for weeks.

That night the team gathered around the trace.

Jonah said, “So we need more data in context.”

Lena said, “We need fewer assumptions about context completeness.”

Sofia, invited for the postmortem, said, “You also need to stop treating review as a rubber stamp. Sometimes the useful thing isn’t the draft. It’s that the system gets me to the right decision faster.”

That shifted the project.

Until then, they had informally treated human involvement as temporary scaffolding on the path to autonomy. Now Mira challenged the framing.

“What if handoff quality is not a concession,” she asked, “but a core product feature?”

They instrumented the human loop seriously.

Reviewers could now:

- approve, edit, or reject proposals
- tag why they intervened
- annotate missing context
- flag policy ambiguity
- rate handoff usefulness separately from final answer quality

The team measured not just automation rate, but reviewer time saved, correction burden, and escalation clarity.

A surprising result followed. Some workflows with low full autonomy still created substantial operational value because the drafts and summaries were excellent. Other workflows with higher autonomy were net negative because humans spent too much energy double-checking uncertain cases.

Mira presented this to leadership with unusual force.

“We should stop asking, ‘How autonomous is it?’ and ask, ‘How does it change the economics and quality of the work system?’”

The CEO, to his credit, nodded slowly instead of demanding a more exciting chart.

Seventh principle:

**Human-in-the-loop is not the opposite of agentic. It is often the product.**

The purpose of the harness was not to eliminate people at all costs. It was to allocate judgment wisely.

## 7. Memory Is a Liability Until It Is an Asset

Success brought ambition.

Once the pilot stabilized, someone from sales requested that the same agent support ongoing account relationships. “It should remember the customer,” they said. “Like a great concierge.”

Mira felt a headache form with professional efficiency.

In the next meeting, a slide appeared titled:

**PERSISTENT MEMORY = DELIGHT**

Mira added a second title beneath it:

**PERSISTENT MEMORY = ALSO NEW WAYS TO BE WRONG FOREVER**

Ravi grinned. Jonah looked pained. The sales lead looked unconvinced.

The problem was real. Many support interactions benefited from continuity: preferred communication style, repeated pain points, prior concessions, known integration quirks. But “memory” was not one thing.

They broke it apart.

There was:

- conversational context for the current task
- durable business facts from systems of record
- learned preferences inferred from past interactions
- temporary working notes
- feedback artifacts from human reviewers

Mixing these into a single blob would be catastrophic.

So the harness treated each differently.

Systems of record remained authoritative.
Inferred preferences were stored separately with confidence and provenance.
Temporary notes expired.
Human annotations required scope and review.
Anything the model “remembered” had to be retrievable as data with source metadata, not merely reintroduced as narrative folklore.

They also made memory query-based rather than automatically stuffed into every prompt. The model had to ask, through a retrieval policy, for relevant history categories. The harness then selected and summarized with strict budgets.

Why? Because irrelevant memory does not merely waste tokens. It steers reasoning.

During one eval, a customer had once been granted an exception months earlier. The model, seeing that history, assumed another exception was likely appropriate now, even though the policy had changed.

After that, all memory objects gained timestamps and policy-version context where applicable.

Lena insisted on one more rule: user-correctable memory.

“If the system infers that I prefer something and gets it wrong, there must be a way to fix it,” she said. “Otherwise personalization becomes automated stubbornness.”

Eighth principle:

**Memory is controlled context, not accumulated text.**

A harness that remembered carelessly was just a machine for preserving misunderstandings.

## 8. Cost, Latency, and the Three-Way Bargain

By midsummer the pilot numbers looked respectable enough that finance began paying attention.

This was never a bad sign. It meant the project had crossed from curiosity into metabolism.

The system worked, but it was expensive.

Long contexts, multiple tool calls, retries on malformed outputs, evaluator traffic, and review workflows had created a machine that solved problems thoughtfully and billed accordingly.

The CFO sent a note with the subject line: **Do agents have to think this much?**

Mira printed it and taped it to the evals basement wall.

She and Ravi began a study of the three-way bargain every harness eventually faces: quality, latency, cost.

They bucketed tickets by complexity and replayed them under different strategies.

Could a cheaper model do classification before escalating complex reasoning to a stronger model?
Could retrieval be skipped for very common issues with exact policy rules?
Could some workflows use deterministic templates after structured fact gathering?
Could malformed tool calls be repaired by the harness instead of re-asking the model?
Could uncertainty thresholds terminate bad runs earlier?

The answer, maddeningly, was yes to all of these, but not in one universal pattern.

A router emerged.

Simple password-reset-adjacent tickets took a fast path.
Refunds used a medium path with eligibility checks and structured drafts.
Enterprise incidents used a slow path with richer context and mandatory human review.

They also learned a subtle lesson. Cost optimization at the wrong layer caused regressions.

Making the prompt shorter indiscriminately hurt edge-case performance.
Switching to a cheaper model globally increased human review time enough to erase savings.
Reducing retrieval depth improved latency while increasing policy mistakes in exactly the slices that mattered most.

Tessa summarized the issue.

“Stop talking about cost per run,” she said. “Talk about cost per successfully resolved case at target risk.”

That phrase ended several unhelpful meetings.

Ninth principle:

**The unit of optimization is the work system, not the model call.**

An agent that was cheap to run but expensive to trust was not cheap.

## 9. The Near-Miss

Every serious engineering effort eventually receives its moral education.

Theirs came on a Thursday afternoon.

A new experiment had been rolled out to ten percent of traffic. The change was meant to reduce unnecessary escalations by letting the model proceed when it had high confidence and policy evidence.

At 2:14 p.m., the system processed a ticket from a customer requesting a refund for a duplicate charge. It gathered account info, checked eligibility, and found mixed signals. One document described a self-serve refund rule. Another, newer policy required fraud review for this payment pattern.

The model cited the older rule and prepared a refund request.

A code gate should have blocked execution because the policy evidence conflicted.

Instead, due to a bug in how confidence aggregation handled missing version metadata, the gate interpreted the evidence as sufficient.

The refund request was created.

Fortunately, the downstream finance system still required a nightly reconciliation for that account type, and a human analyst caught the mismatch before funds moved. No customer harm occurred. But for forty-three minutes, Vale had an autonomous path from ambiguous policy to financial action.

The postmortem meeting was silent in the way only near-disasters can make a room silent.

Jonah said, weakly, “The model picked the wrong document.”

Mira looked at the trace, then at the code gate, then back at the trace.

“No,” she said. “The system failed to remain safe when the model picked the wrong document.”

Nobody argued.

The next week changed the team more than any prior success had.

They introduced defense in depth everywhere dangerous.

For sensitive actions:

- the model had to produce structured justification
- retrieval had to return policy provenance
- rule gates validated required conditions
- conflicting evidence forced escalation
- downstream systems independently rechecked critical constraints
- audit logs captured all decision artifacts

They also instituted canaries, rollback triggers, and scenario-based release criteria for high-risk workflows. No experiment touching financial or legal actions could launch without named owners, failure budgets, and explicit blast-radius limits.

Lena, who had spent months patiently explaining this in other language, finally got to say, “Welcome to regulated thinking.”

Tenth principle:

**Never ask a model to be the final guardian of a high-consequence boundary.**

If a mistake matters, another layer must know how to catch it.

## 10. The Workshop

In autumn, with the system stable enough to be boring on good days, Mira started a weekly internal workshop called Harness Review.

People came from support, product, security, data, legal, and every team trying to build “agents” of their own. Procurement wanted vendor-management agents. Finance wanted reconciliation agents. HR wanted policy assistants but very carefully. Sales wanted everything.

Mira began each session the same way.

“Bring one trace, one failure, and one thing you currently believe that might be wrong.”

The workshop quickly became the most useful meeting in the company because it punished theater and rewarded diagnosis.

One team had built a research agent that kept citing irrelevant market reports.
The problem was not retrieval quality alone; their task spec failed to distinguish exploratory breadth from decision-grade evidence.

Another team had an onboarding assistant that gave beautifully phrased but incomplete instructions.
The problem was that their eval judged tone and completion, but not downstream task success.

A security review agent performed well in demos and poorly in production because its tools exposed raw logs without summarization, drowning the model in low-signal text.

Across all cases, the same pattern recurred. Teams talked first about prompts and models because those were the dramatic pieces. But lasting progress came from harness questions:

- What is the unit of work?
- What state is explicit?
- What are the legal transitions?
- What tools exist and how constrained are they?
- Where are the stop conditions?
- How do humans enter and exit the loop?
- What is measured by scenario?
- What happens under uncertainty?
- What assumptions are made about memory?
- Where is the high-consequence boundary?

One evening after the workshop, Ravi stayed behind while Mira erased the board.

“You know what this is starting to feel like?” he said.

“What?”

“Distributed systems in business casual.”

Mira laughed.

He continued, “Unreliable components, partial information, hidden state, retries, idempotency, observability, failure domains, human operators. We changed the API surface and the failure texture, but not the need for discipline.”

Mira put down the eraser.

“Yes,” she said. “Except the unreliable component can write memos defending its mistakes.”

Eleventh principle:

**Agentic systems are software systems first. Their novelty does not repeal engineering.**

## 11. The Board Demo

Nine months after Project Northstar began, the board came to headquarters.

Jonah wanted a dazzling autonomous flow. The CEO wanted a strategic story. The board wanted reassurance disguised as curiosity.

Mira wanted none of the usual demo tricks.

So she designed the presentation around a single customer ticket, shown in three ways.

First, she showed what the original prototype would have done. It read smoothly, called tools eagerly, and ended with a polished but wrong response.

Second, she showed the current harness handling the same ticket. The system classified the issue, gathered facts, retrieved policy with provenance, identified missing context, produced a partial draft, and escalated with a concise handoff because the risk threshold was crossed.

Third, she showed the evaluation and review artifacts around that run: scenario slice, confidence bands, policy checks, expected human effort, and audit trail.

One board member said, “The second one feels less magical.”

Mira nodded. “It is less magical. It is more useful.”

Another asked, “Will it become fully autonomous over time?”

Mira answered carefully.

“In some workflows, yes. In others, that is the wrong goal. Our objective is not maximal autonomy. It is maximum reliable leverage.”

She then showed the operating metrics from the pilot:

Lower average handling time on supported ticket classes.
Higher consistency in policy adherence.
Better handoff quality.
Reduced dangerous action rate.
Known weak scenarios with mitigation plans.
Cost per successful resolution at acceptable risk.

The board’s questions changed tone. They stopped asking whether Vale had an agent strategy and started asking whether the company had a disciplined way to expand these systems.

That, Mira realized later, was the real milestone.

Not when the model looked impressive.
Not when the dashboard trended up.
But when the surrounding organization began to think in harness terms.

## 12. What Mira Wrote Down

Near the end of the year, after the launches and postmortems and workshops, Mira took a Friday offsite day alone in the small park behind headquarters. She brought coffee, a notebook, and the accumulated exhaustion of having learned a field by helping create it.

She tried to write down what had actually been discovered.

Not slogans. Not vendor-neutral platitudes. The working truths that had survived contact with production.

She wrote:

1. **A model is not an agent.** The agent is the model plus the harness around it.
2. **Harness failures dominate early.** Fix interfaces, state, control flow, and evals before blaming raw model capability.
3. **Tools are contracts.** Every ambiguity in a tool becomes reasoning debt inside the loop.
4. **State should be explicit.** Do not spend model cognition on bookkeeping the system can track deterministically.
5. **Evals must be scenario-based.** Average performance hides operational risk.
6. **Keep logic out of prompts when possible.** Natural language is flexible but difficult to verify.
7. **Human review is part of system design.** Measure the work system, not just autonomy.
8. **Memory needs structure, provenance, and scope.** Otherwise it preserves error.
9. **Optimize end-to-end economics.** Cheap calls can produce expensive operations.
10. **High-consequence actions require layered controls.** The model cannot be the sole backstop.
11. **Observability is mandatory.** If you cannot inspect traces, state, tool use, and outcomes, you are operating on superstition.
12. **The organization must learn with the system.** Harness engineering is social as much as technical; policy owners, operators, and engineers must co-design reality.

She stared at the list for a while.

It still felt insufficient.

Then she added one final line.

13. **The goal is not to simulate a person. The goal is to build a dependable machine for applied judgment.**

That evening she turned the notes into an internal memo. It circulated far beyond Vale. People forwarded it to friends at other companies. Some argued with it. Some quoted it back at her in meetings. A few misread it as anti-agent, which amused her because she had spent the year making one useful.

Months later, a new team asked if they could use Northstar’s harness for a procurement workflow.

Mira said yes, but only if they came to Harness Review and brought real traces.

“Why?” the team lead asked.

“Because the work will look different,” she said, “but the mistakes will rhyme.”

## Epilogue: The Shape of the Machine

On a winter morning nearly a year after her accidental promotion, Mira visited the support floor before most people arrived. Screens glowed in rows across the dim room. The city outside was just becoming visible through the glass.

She opened a few recent traces.

One run was elegant: quick classification, one retrieval, no wasted motion, a clean escalation package.
Another was messy but bounded: uncertain evidence, conflicting account history, correct handoff.
A third had failed, but failed legibly, with enough artifacts for the team to improve it.

That was what she had come to love about the harness.

Not that it made the model intelligent.
The model already was, in its strange and uneven way.

The harness made intelligence answerable.
It gave shape to behavior.
It converted possibility into operations.
It turned a talking machine into a working part of a larger system where money moved, customers waited, rules mattered, and humans remained responsible for the whole.

Later that morning, a new engineer joined the team and asked the question Mira herself had once asked in a meeting that changed her career.

“What exactly do we mean by agent?”

Mira smiled.

She uncapped a marker and wrote on the board:

**A controlled environment in which a model can do bounded work.**

Then beneath it she wrote:

**Everything else is the harness.**
