# Product Spec — MVP
## Grade 10/11 Science Learning Platform (Free Launch)

## 1. Overview

A single-subject, single-tenant MCQ learning platform for Grade 10 and Grade 11 Science
students. Students log in with a social account, land on a dashboard, take quizzes by sub-topic,
and track their progress over time. Free to use for the first 3-4 months to gain traction and
validate demand; a subscription can be switched on afterward without requiring a rebuild.

**Goal:** launch within 4 weeks with minimal infrastructure, prove students actually use and
benefit from it, and generate the data needed to justify expanding to more subjects, grades, and
tutor-created content later.

## 2. User Roles

- **Student** — signs up, selects grade, takes quizzes, views dashboard and progress.
- **Admin** — curates/approves the question bank, monitors usage.

No parent, teacher, or moderator roles at this stage.

## 3. Authentication

Social login using a managed auth provider (e.g. Clerk, Supabase Auth, or Auth0) rather than
custom OAuth integrations — this gives multiple providers as config toggles instead of weeks
of integration work.

- **Google** — build first; this is the primary login method your student users will actually use.
- **Facebook** — add if time allows.
- Only request name + email from the provider — nothing more.
- A single consent checkbox at signup (permission-to-use confirmation), since Grade 10/11
  students are typically minors.

**Flow:**

```
Social login success
  → check if a student profile exists for this user
  → if new: quick onboarding — select grade (10 or 11)
  → land on Dashboard
```

## 4. Dashboard

The screen students land on every session. Three sections:

1. **Continue where you left off** — last incomplete quiz/sub-topic, one tap to resume.
2. **Progress by sub-topic** — Module → Sub-topic → mastery indicator (percentage or a
   simple not-started / needs-work / mastered state).
3. **Completed quizzes** — history list: date, sub-topic, score.

No gamification, streaks, or leaderboards at this stage — keep the loop simple and legible.

## 5. Core Flow: Taking a Quiz

```
Dashboard → select sub-topic → quiz served (MCQs for that sub-topic)
  → student submits answers → score shown
  → attempt logged → mastery score for that sub-topic recalculated
  → dashboard updates
```

Mastery scoring is rules-based for now (e.g., below 60% correct = "needs work," above 80% =
"mastered") — no AI-generated recommendation text required for MVP.

## 6. Data Model

```
users
├── id, email, created_at, status

student_profiles
├── user_id (FK)
└── grade (10 | 11)

subjects              -- one row: "Science"
modules                -- Science modules for grade 10 & 11
sub_topics              -- under each module

content_items
├── id, sub_topic_id, title, storage_uri
└── status (draft | published)   -- admin-reviewed before publish

mcqs
├── id, content_item_id (nullable), sub_topic_id
├── question_text, options, correct_option, difficulty
└── status (draft | published)

quiz_attempts
├── id, student_id, sub_topic_id
└── started_at, completed_at, score

quiz_attempt_answers
├── id, quiz_attempt_id, mcq_id
└── selected_option, is_correct

mastery_scores
├── student_id, sub_topic_id
└── score, last_updated

subscriptions          -- table exists, unused until launch of paid tier
├── id, user_id, status, current_period_end
```

Simple, single-tenant, no ownership/multi-tenancy fields needed since all content belongs to
the platform and there's only one role that creates it.

## 7. Content Strategy

The question bank is the real bottleneck for a 4-week timeline — pick one approach and start
immediately, in parallel with development:

- **AI-assisted drafting, human-reviewed**: draft MCQs and explanations per sub-topic
  using AI from your syllabus outline, then personally review and approve every question
  before it's published. No AI-generated question goes live without review — a factual error
  in week one undermines trust in the whole platform.
- Target coverage: 15-20 verified questions per sub-topic. Prioritize full, verified coverage of
  fewer sub-topics over shallow coverage of everything.

## 8. Subscription (Built, Not Yet Active)

- Stripe Billing integration and `subscriptions` table built during the MVP build.
- A single feature flag (`PAYWALL_ENABLED`) controls whether the entitlement check actually
  restricts access — off during the free period.
- When ready to switch on (month 3-4): flip the flag. Decide upfront whether early free
  users are grandfathered or prompted to subscribe.

## 9. 4-Week Build Plan

**Week 1**
- Social login (Google) + onboarding (grade selection)
- Core schema built, Science taxonomy seeded for Grade 10/11
- Empty dashboard shell deployed

**Week 2**
- Quiz-taking flow: select sub-topic → serve MCQs → submit → score
- Attempt logging wired
- Content drafting/review running in parallel

**Week 3**
- Dashboard: progress-by-sub-topic, quiz history, continue-where-left-off
- Mastery scoring (rules-based)
- Question bank reaches minimum viable coverage for launch sub-topics

**Week 4**
- Stripe Billing + subscriptions table wired (flag off)
- Full-loop QA: login → onboarding → quiz → dashboard
- Soft launch to a small first cohort

## 10. Success Metrics (track from day one)

- % of signed-up students who complete at least one full quiz
- % who return within 7 days
- Average mastery improvement across repeated attempts on the same sub-topic

These numbers are the business case for switching on the subscription in month 3-4, and for
expanding to more subjects, grades, and tutor-created content afterward.
