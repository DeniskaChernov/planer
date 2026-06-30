# Founder OS — product canon

Condensed from “The Book — Strategy Company v0.5”. This document is the product filter for implementation decisions.

## Thesis

Founder OS does not exist to remember more or organise information more beautifully. It exists to make the person or organisation making a decision measurably better. Speed and automation are the wedge; quality of judgement is the essence.

## Non-negotiable principles

1. Every feature must make the decision-maker better.
2. Model → product → platform. Do not build a horizontal platform before a living vertical product.
3. Memory is a capability over entities and provenance, not a standalone entity.
4. One product, isolated tenants. The internal company is tenant zero.
5. Deploy means human approval in v1, never silent autonomy.
6. Judgement mechanics belong in v1.
7. Build a vertical knife: one Intent through a complete cycle.
8. Prefer causality to decorative progress bars.
9. Narrow choice instead of expanding scope.
10. Measure improvement from day one.

## Core ontology

The first-class entities are Person, Organization, Goal, Decision, Project, Task, Event, Document and Principle. Relationships are typed, directed and carry metadata. Important state transitions must keep who, when and why.

Planner’s current first judgement mechanic is Decision Capture + Review: choice, rationale, expected outcome, confidence, author, date and later validation/reversal.

## AI behaviour

Founder AI must separate facts from assumptions, surface conflicts with goals and resources, distinguish reversible from irreversible decisions, use short pre-mortems where appropriate, and separate decision quality from luck. It proposes; the human approves.

## Tenancy and data

Design system, philosophy, architecture and AI engine are shared. Tenant data is fully isolated. `external_user_id` may connect identity to Finance, but databases and permissions remain separated.

## Visual system

- Display: Soyuz Grotesk.
- Body and small text: Montserrat.
- Background: `#0A0A0D`; elevated: `#131318`.
- Text: `#ECECF1`; muted: `#9B9BA8`; faint: `#6B6B78`.
- Primary violet: `#8B6CFF`; bright violet: `#A78BFA`.
- Semantic: amber `#E0A458`, green `#5BD6A0`, red `#F0686E`.
- Use restraint, air, thin borders, subtle texture and clear hierarchy. Glass is a material, not decoration.

## Mobile web requirements

The phone experience is an installable web application, not a reduced desktop page. Respect safe areas, use touch targets of at least 44px, prevent input zoom, keep primary navigation thumb-reachable, make connection/sync state visible, and update the service worker without trapping users on stale releases.
