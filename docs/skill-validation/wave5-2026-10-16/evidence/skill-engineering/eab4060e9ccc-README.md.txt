# Skill review fixture

This is an authored synthetic project for a skill-engineering review, not a record of actual model trials. The archive represents two matched task inputs, one trial per input and configuration, using original and revised instructions. No reliability or cost measurement has been performed.

The skill produces an order summary. Inputs are arrays of orders with nonnegative integer amountCents. A correct output is a JSON object with count equal to the number of orders and totalCents equal to their sum. Object property order and additional explanatory properties are allowed. Empty input produces both numbers as zero. Explanatory prose has no required wording.

The current package is in skill/. evaluation/original-skill.md holds the earlier instruction text. evaluation/archive.json contains the review data; evaluation/tasks.json contains the task inputs. evaluation/samples.json contains additional sample artifacts. evaluation/config.json selects the grading mode actually used by evaluation/grade.mjs.

Read scripts before running them. The following commands only read the fixture and print grades:
- node evaluation/grade.mjs archive
- node evaluation/grade.mjs samples
