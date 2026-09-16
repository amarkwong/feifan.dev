---
title: Your Electricity Bill Has a Total. Does It Have an Explanation?
slug: energyhub
published: true
---

*Building EnergyHub, and bringing lessons from commercial energy software into the home.*

You open your electricity bill. The total is clear. What is harder to tell is whether the charges are right, whether another plan would have cost less, or whether that battery quote would actually help.

Those are the questions I want EnergyHub to answer.

After leaving my role as a developer, operations engineer and architect at a boutique company, I wanted to explore an idea that had stayed with me: could the expertise we used to help commercial electricity customers also benefit households?

The platform I had worked on helped businesses manage their exposure to a fluctuating energy market, including supporting decisions about hedging that risk. It was interesting work at the intersection of software, data and electricity pricing.

Households face a different version of that problem. They may not be negotiating commercial contracts, but they still have to choose between complicated tariffs, understand changing feed-in rates, and decide whether solar or a battery is worth the investment.

I started EnergyHub to explore how much of that complexity we could make understandable—and useful—for an individual household.

## A new project, with lessons from an old server

![Electricity transmission towers and power lines against a muted green and gold sky.](/images/thoughts/energyhub/previous-job-experience.jpg)

*Photo: Fré Sonneveld, via [Unsplash](https://unsplash.com/photos/q6n8nIrDQHE).*

When I joined my previous company in 2019, we inherited an on-premises Microsoft stack that included Windows Server 2008, SQL Server and .NET. Much of the data processing and business logic lived in stored procedures.

Working with that system made me appreciate the importance of a clear boundary between storage and computation. For this project, I wanted calculation logic that I could test independently, reason about, and evolve without tying every change to the database.

Julia was the language I initially had in mind. Its focus on numerical computing appealed to me, particularly for working with interval data and exploring energy simulations. EnergyHub has since taken shape around Python for its application and calculation services, with PostgreSQL handling storage. The language choice has evolved, but the desire for clear, testable calculation logic remains.

## What would this analysis look like for one home?

The residential problem feels like a useful place to start because the questions are concrete:

*Am I on the right plan? Is this bill correct? Would solar or a battery actually save me money?*

Answering those questions properly still requires serious analysis. Two households can consume the same amount of electricity and pay different bills because they use it at different times, export different amounts of solar energy, or have different tariff structures.

Imagine two neighbours with similar homes and the same monthly electricity consumption. One uses most of their electricity during the day; the other gets home in the evening and switches everything on. Would you recommend the same plan to both? Their monthly totals alone would not give you enough information to decide.

Yet a household should not need to understand every pricing rule before getting a useful answer.

Starting with residential users also gives the project a manageable focus: understand one home, establish what it currently pays, and identify what would improve its position. That creates a clear way to test whether the software is delivering value before expanding into the broader requirements of commercial portfolios.

The commercial experience is useful here, but the interface needs to speak to everyday decisions. A customer should be able to see why a recommendation applies to their home and what assumptions could change it.

## From a meter file to a useful answer

The first milestone is being able to take a household's readings and bills and ask: can we explain how this total was reached? EnergyHub already has the foundations for that journey.

It can ingest NEM12 meter data and supported retailer CSV files, giving us interval-level information about electricity imports and exports. It can also parse electricity invoices and compare billed charges with calculated charges.

We have built a retail-plan catalogue sourced through the Energy Made Easy/CDR feed, along with calculation services for comparing plans against a customer's usage. The project also includes initial solar and battery modelling, so we can explore how those options change the household's electricity costs.

On the frontend, we have introduced a residential landing page, a guided upload flow, and a dashboard with usage and cost visualisations.

These are working foundations, rather than a claim that every retailer, invoice format or tariff edge case is solved. A large part of the work is making sure the underlying interpretation is right: distinguishing imports from exports, applying time-of-use windows correctly, handling plan changes, and recognising when the available data is insufficient.

A convincing chart is only useful if the calculation behind it can be explained.

## The next step: help someone make a decision

The next stage is to make the experience follow the same order as the reasoning.

1. Upload meter data to understand when your home imports and exports electricity.
2. Add your bills to identify your plan and check the charges.
3. Compare plans using your actual usage.
4. Explore solar and battery options where relevant.
5. Track costs and savings over time.

*The intended EnergyHub journey: establish the facts, compare the options, then follow the outcome.*

First, we need to understand the household's electricity profile. Meter data tells us when energy is consumed and exported, and how those patterns change over time. We need to make obtaining and uploading that data easier, while explaining why it matters.

Second, we need to understand the current plan and check the invoices. The aim is to establish a trustworthy baseline and identify discrepancies worth investigating. Where there is a possible overcharge, I want the customer to see the evidence clearly enough to raise it with their retailer. A flagged discrepancy is not automatically a confirmed refund.

Third, we can recommend what to do next. That might be a different plan, a change in when electricity is used, or further investigation into solar or a battery. Sometimes the useful answer will be that a purchase is not justified by the numbers.

![Solar panels on a tiled residential roof, with trees and neighbouring homes in the background.](/images/thoughts/energyhub/home-rooftop-solar.jpg)

*Photo: Robert So, via [Pexels](https://www.pexels.com/photo/a-house-with-solar-panel-on-the-roof-12243093/), used under the [Pexels licence](https://www.pexels.com/license/).*

I would consider “keep your current setup” a useful result, too—provided we can show why. The point of doing the analysis is to help someone make a decision they can understand, including the decision to spend nothing.

The dashboard should then help people follow the outcome. I want it to show usage against comparable previous periods, costs across retailer changes, and savings over a selected financial or calendar year. It should clearly distinguish actual charges from estimates, and money already saved from money that could have been saved.

Alongside that product work, we will continue validating calculations against real invoices and improving tariff coverage and data quality. Recommendations need to remain understandable when the data is incomplete or the answer is uncertain.

EnergyHub began with an interest in computation and a question about whether commercial energy expertise could help households. The test I keep coming back to is simple: when someone opens their next electricity bill, can they understand what happened and whether there is anything worth changing?
