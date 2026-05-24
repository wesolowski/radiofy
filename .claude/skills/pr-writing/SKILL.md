---
name: pr-writing
description: Use when writing or updating a pull request description for this project. Produces a business-readable English PR text containing only background and business impact — never file lists, test plans, or technical implementation detail.
---

# Pull Request Description

The customer reads every pull request description. It must be understandable
from a business perspective and must never reveal how the work was produced.

## Language

English. Always.

## Structure

Exactly two sections, nothing else:

### Background
Why is this change being made? Which problem does it solve? Start from the
ticket's `Background` section and phrase it from the customer's point of view.

### What this change does
A high-level description of the outcome in business terms — what is now
possible, fixed, or improved.

## Never include

- File lists or changed-file counts
- Test details or test plans
- Internal code logic or implementation detail
- Class, method, or variable names
- Code snippets
- Any reference to AI tooling, code generation, or how the work was produced

## Example

**Bad** (technical, leaks implementation):

> Adds `InvoiceRoundingService::applyBankersRounding()` and adjusts the
> `InvoiceController`. 3 files changed, 2 new unit tests.

**Good** (business-readable):

> ## Background
> On invoices with multiple line items, the total occasionally differed from
> the sum of the individual items by one cent due to rounding.
>
> ## What this change does
> Invoice totals are now rounded consistently, so the displayed grand total
> always matches the sum of the individual line items.

## Before you finish

- Re-read the description as if you were the customer: is anything technical
  still in there?
- Confirm no class/method names, no file paths, and no reference to AI tooling
  remain.
