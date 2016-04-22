# nrs-sparx-automation

## Export TestCase Tests from Sparx EA

After a test case is generated and copies are made of the scenario tests
(detailed in the modeling standard), these copies are used for elaborating the
details of the acceptance and system tests. When the detailing of the tests is
complete these tests can be exported from Sparx EA and subsequently imported
into JIRA/Zephyr for test execution and test lifecycle management. In order for
this export from Sparx EA to succeed some care is needed in the structure of the
test details. In particular, the test designer can specify details for each test
step in the "Input" and "Acceptance Criteria" tabs of the test detail.

When a Test Case is created from the parent System Use Case, the Test steps to
be executed are automatically extracted from the Structured Specification steps
defined for a System Use Case. These steps are inserted in to the Description
tab of the test. However, there is no test step input or acceptance criteria
details extracted from the System Use Case. If the test designer needs input or
acceptance criteria details at the level of the test steps, then they must add
this detail to the Input tab and Acceptance Criteria tab of the Test. In order
to structure and align this Test Step Input or Acceptance Criteria step detail
with the extracted test steps in the Details tab, for export to JIRA, the test
designer must insert 'parsing tokens' into the Input tab and the Acceptance
Criteria tab.

Test tab            | Parsing Token
------------------- | -------------
Desription          |  None
Result              | None
Input               | NRS_TEST_STEP_INPUT_DATA
Acceptance Criteria |  NRS_TEST_STEP_RESULTS


## Refer to the following for more details
https://confluence.nrs.gov.bc.ca/display/CSF/Test+Case+Creation+and+Elaboration+in+Sparc+EA

## License

    Copyright 2015 Province of British Columbia

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
