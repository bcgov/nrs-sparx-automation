!INC Local Scripts.EAConstants-JScript
!INC EAScriptLib.JScript-DateTime
!INC EAScriptLib.JScript-Logging

/*
 * Script Name: JScript-ExportTestCase
 * Author: David Kerins ( https://github.com/david-kerins )
 * Purpose: Export Test Case to CSV file for import to JIRA/Zephyr
 * Date: 2016/03/16
 * Version: 20160316
 */

var DEBUG = false;  //Change DEBUG to true if you want some DEBUG output.
var VERBOSE = false;  //Change DEBUG and VERBOSE to true if you want copious DEBUG output.
var CSV_DELIMITER = ",";
var exportFile;
var exportIsExporting = false;
var modelName;

// Regular Expression variables

var lineNumbers_regex    = /^(\d+[a-z]?_?\d*)\./m;
var testStepDetail_regex = /^(\d+[a-z]?_?\d*\.[\s\S]*)/m;

var testStepsParseToken_regex  = /(?:[\s\S]*Start:)(?:[\s\S]*)/m;
var testNotesDescription_regex = /([\s\S]*)Start:/;
var testNotesSteps_regex       = /(Start:\r\n[\s\S]+)??(?:Result)+?/;

var testInputParseToken_regex = /NRS_TEST_STEP_INPUT_DATA/m;
var testInput_regex           = /([\s\S]*)NRS_TEST_STEP_INPUT_DATA/;
var testInputsSteps_regex     = /NRS_TEST_STEP_INPUT_DATA([\s\S]*)/;

var testAcceptanceCriteria_regex = /NRS_TEST_STEP_RESULTS/m;
//var testAcceptanceCriteria_regex      = /(?:Result:\r\n)([\s\S]+)/m;  //If AC comes from below 'Results:' in Description Tab.
var testAcceptanceCriteria_regex      = /([\s\S]*)NRS_TEST_STEP_RESULTS/; //If we want AC desctiption from the AC tab.
var testStepsAcceptanceCriteria_regex = /(NRS_TEST_STEP_RESULTS[\s\S]*)/;

function main()
{
	// Get the context object selected by the user
	var contextObject = Repository.GetContextObject();
	var contextObjectType = Repository.GetContextItemType();

	modelName = GetModelName(contextObject);
	if (DEBUG) { Session.Output( "DEBUG: Project Name: " + modelName)};

	// Create the CSV file header.  The order compliments the JIRA importer tool.
	var headerRow =
		"Name" + "," +
		"Step" + "," +
		"Result" + "," +
		"Testdata" + "," +
		"Labels" + "," +
		"Description" + "," +
		"TestInput" + "," +
		"AcceptanceCriteria" + "," +
		"TestResult" + "," +
		"TestType" + "," +
		"TestCase" + "," +
		"TestCaseGUID"
		;

	if ( contextObjectType == otPackage )
	{
		// Get the context object as a package
		var contextPackage as EA.Package;
		contextPackage = Repository.GetContextObject();
		if (DEBUG) { Session.Output( "  DEBUG: Package: " + contextPackage.Name + " (Type=" + contextPackage.ObjectType + ", ID=" + contextPackage.PackageID + ")" )};

		var cleanPackageName = contextPackage.Name.replace( / - /g, "_" );
		var cleanPackageName = cleanPackageName.replace( / /g, "_" );
		var fileName = "C:\\temp\\" + cleanPackageName + ".csv";
		if (DEBUG) { Session.Output( "  DEBUG: Filename: " + fileName )};

		CSVExportInitialize(fileName);
		CSVExportRow(headerRow);
		ExportMultipleTestCases(contextPackage);  //We recurse into package objects
		CSVExportFinalize();

	}
	else if ( contextObjectType == otElement)
	{
		// Get the context object as a package
		var contextElement as EA.Element;
		contextElement = Repository.GetContextObject();

		if ( contextElement.Type == "UseCase" )
		{
			if (DEBUG) { Session.Output( "  DEBUG: UseCase: " + contextElement.Name + " (Type=" + contextElement.Type + ", ID=" + contextElement.ElementID + ")" )};
			var cleanElementName = contextElement.Name.replace( / - /g, "_" );
			var cleanElementName = cleanElementName.replace( / /g, "_" );
			var fileName = "C:\\temp\\" + cleanElementName + ".csv";
			if (DEBUG) { Session.Output( "  DEBUG: The Filename " + fileName )};

			CSVExportInitialize(fileName);
			CSVExportRow(headerRow);
			ExportSingleTestCase(contextElement);
			CSVExportFinalize();
		}
		else
		{
			Session.Output( "ERROR: You need to pick a UseCase/TestCase Element or the parent Package: " + contextElement.Name + ": " + contextElement.Type );
		}
	}
	else
	{
		Session.Output( "ERROR: You need to pick a TestCase Element or the parent Package: " + contextObjectType );
	}
	Session.Output( "\nDone! Check for the output file: " + fileName );
}


function ExportMultipleTestCases(thePackage)
{
	// Show the script output window
	Repository.EnsureOutputVisible( "Script" );

	// Cast thePackage to EA.Package so we get intellisense
	var contextPackage as EA.Package;
	// Get the thePackage to work on
	contextPackage = thePackage;

	if ( contextPackage.ObjectType == otPackage )
	{
		// Recurse through all child packages and get Test Case Tests.
		var childPackageEnumerator = new Enumerator( contextPackage.Packages );
		var currentPackage as EA.Package;
		currentPackage = contextPackage;
		var childElementEnumerator = new Enumerator(currentPackage.Elements );

		while ( (!childPackageEnumerator.atEnd() && childElementEnumerator.atEnd()) || (childPackageEnumerator.atEnd() && !childElementEnumerator.atEnd()) )
		{
			if (!childPackageEnumerator.atEnd() && childElementEnumerator.atEnd())
			{
				ExportMultipleTestCases(childPackageEnumerator.item()); //Recursion step
				childPackageEnumerator.moveNext();
			}
			if (childPackageEnumerator.atEnd() && !childElementEnumerator.atEnd())
			{
				while ( !childElementEnumerator.atEnd() )
				{
					var currentElement as EA.Element;
					currentElement = childElementEnumerator.item();
					if ( currentElement != null && currentElement.ObjectType == otElement && currentElement.Type == "UseCase" )
					{
						ExportSingleTestCase(currentElement);
					}
					childElementEnumerator.moveNext();
				}
			}
		}
	}
	else
	{
		Session.Prompt( "ERROR This script requires a package to be selected.\n" +
				"Please select a package and try again.", promptOK );
	}
}

function ExportSingleTestCase(theElement)
{
	// Show the script output window
	Repository.EnsureOutputVisible( "Script" );

	var contextElement as EA.Element;
	contextElement = theElement;

	if ( contextElement != null && contextElement.ObjectType == otElement )
	{
		var tests as EA.Collection;
		tests = contextElement.Tests;
		if (DEBUG) { Session.Output( "  DEBUG: Test Count: " + tests.Count)};

		var testCaseName = __SafeCSVString(contextElement.Name);
		var testCaseGUID = __SafeCSVString(contextElement.ElementGUID);
		var elementType = __SafeCSVString(contextElement.Type);
		Session.Output("\nTestCaseName: " + testCaseName + " " + testCaseGUID );

		// Get the Use Case connected to the Test Case
		var elementConnectors as EA.Collection;
		elementConnectors = contextElement.Connectors;
		for ( var j = 0 ; j < elementConnectors.Count ; j++ )
		{
			// Get the current connector and the element that it connects to
			var currentConnector as EA.Connector;
			currentConnector = elementConnectors.GetAt( j );
			var connectedElement as EA.Element;
			connectedElement = Repository.GetElementByID( currentConnector.SupplierID );

			if ( connectedElement.Type == "UseCase" )
			{
				//Get UseCase attributes.

				if (DEBUG) { Session.Output( "  DEBUG: Use Case Name:  " + connectedElement.Name)};
				if (DEBUG) { Session.Output( "  DEBUG: Use Case Note:  " + connectedElement.Notes)};
				Session.Output( "  DEBUG: Use Case Name:  " + connectedElement.Name);
				Session.Output( "  DEBUG: Use Case Note:  " + connectedElement.Notes);
				var useCaseNote = connectedElement.Notes;

				//Get the associated UseCase Scenario Name and Description
				var scenarios as EA.Collection;
				scenarios = connectedElement.Scenarios;
			}
		}

		//Create test labels, only using the Model Name right now.
		var testLabel = modelName.replace(/ /g, ",");
		testLabel = "\"" + testLabel + "\"";  //Can't feed label to __SafeCSVString().  Need the commas in JIRA to delineate the labels.
		testLabel = testLabel.toLowerCase();
		if (DEBUG) { Session.Output("Labels: " + testLabel) };

		//Iterate through the set of tests contained in the TestCase element.
		for ( var testCountInterator = 0, testCount = tests.Count ; testCountInterator < testCount; testCountInterator++ )
		{
			var test = {};
			test = tests.GetAt( testCountInterator );

			// Decode table for test.Class attribute.
			var testType;
			switch(test.Class) {
				case 1:
					testType = "Unit Tests";
					break;
				case 2:
					testType = "Integration Tests";
					break;
				case 3:
					testType = "System Tests";
					break;
				case 4:
					testType = "User Acceptance Tests (UAT)";
					break;
				case 5:
					testType = "Scenario Tests";
					break;
				case 6:
					testType = "Inspection Tests";
					break;
				default:
					testType = "";
			}

			if (testType == "Scenario Tests") {
				continue; //We do not process Scenario test types.
			}

			//
			// Get Use Case Scenario attributes associated with current test
			var useCaseScenarioNote;
			var useCaseScenarioName;

			for ( var i = 0 ; i < scenarios.Count ; i++ )
			{
				var currentScenario as EA.Scenario;
				currentScenario = scenarios.GetAt( i );

				if (test.name == "Basic Path" && currentScenario.Type == "Basic Path") {
					useCaseScenarioName = currentScenario.Name + " Basic Path";
					useCaseScenarioNote = currentScenario.Notes;
					break;
				} else if ( test.name.match(currentScenario.Name)) {
					useCaseScenarioName = currentScenario.Name;
					useCaseScenarioNote = currentScenario.Notes;
					break;
				}
			}
			if (DEBUG) { Session.Output( "  DEBUG: ScenarioName: " + useCaseScenarioName + "   :ScenarioType: " + currentScenario.Type )};
			if (test.name == "Basic Path"){
				var testName = __SafeCSVString(useCaseScenarioName);
				if (VERBOSE) { Session.Output( "    VERBOSE:   Using UC Scenario Name for Test Name: " + testName + "  Type: " + testType)};
			} else {
				var testName = __SafeCSVString(test.name);
				if (VERBOSE) { Session.Output( "    VERBOSE:   Test Name: " + testName + "  Type: " + testType)};
			};

			Session.Output("\n  Test Name: " + testName + " Test Type: " + testType);


			var testNotes = removeHTMLTags(test.Notes);
			if (DEBUG) { Session.Output("  DEBUG: Test Notes (Scrubbed) ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n" + testNotes)};
			//Get the test level description, input and acceptance criteria.
			//i.e. the text above the three tokens (Start:,TEST_STEP_INPUT_DATA and TEST_STEP_RESULTS)
			if (testNotesDescription_regex.test(testNotes)){
				var testNotesDescription = testNotes.match(testNotesDescription_regex)[1];
			}

			//Determine whether the UseCase Scenario Note or the Test Notes is used as the Test Description
			if (useCaseScenarioNote == "" || useCaseScenarioNote === undefined){
				var testDescription = __SafeCSVString(testNotesDescription);
				if (VERBOSE) { Session.Output( "    VERBOSE: Test Description: " + encodeURIComponent(testNotesDescription))};
			} else {
				var testDescription = __SafeCSVString(useCaseScenarioNote);
				if (VERBOSE) { Session.Output( "    VERBOSE: UC Scenario Description: " + useCaseScenarioNote)};
			}

			// Scrub the test.Input and get the Test level description
			var testInput = removeHTMLTags(test.Input);
			if (DEBUG) { Session.Output("  DEBUG: Test Input (Scrubbed) ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n" + testInput)};
			if (testInput_regex.test(testInput)){ //Parsing token is there
				var testInputDescription = __SafeCSVString(testInput.match(testInput_regex)[1]);
			} else { //Parsing token is not there, get whole Input tab as Description
				var testInputDescription = __SafeCSVString(testInput);
			}

			// Scrub the test.AcceptanceCriteria and get the Test level Acceptance Criteria description
			var testAcceptanceCriteria = removeHTMLTags(test.AcceptanceCriteria);
			if (DEBUG) { Session.Output("  DEBUG: Test Acceptance Criteria (Scrubbed) ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n" + testAcceptanceCriteria)};

			if (testAcceptanceCriteria_regex.test(testAcceptanceCriteria)){ //Parsing token is there
				//var testAcceptanceCriteria = __SafeCSVString(testNotes.match(testAcceptanceCriteria_regex)[1]); //If we use "Result:" in testNotes
				var testAcceptanceCriteriaDescription = __SafeCSVString(testAcceptanceCriteria.match(testAcceptanceCriteria_regex)[1]);
			} else { //Parsing token is not there, get whole Input tab as Description
				var testAcceptanceCriteriaDescription = __SafeCSVString(testAcceptanceCriteria);
			}

			// Not using test.TestResults but grab for future use.
			var testResults = __SafeCSVString(test.TestResults);

			var testStepsKVObj = {};  //Final test step name Key/Value object

			//Call function to get the set of test steps for the current test.
			createTestSteps(testStepsKVObj, testNotes);

			var testStepsInputsKVObj = {};  //Final test steps inputs Key/Value Object

			//Call function to get the set of test steps inputs for the current test.
			createTestStepsInputs(testStepsInputsKVObj, testInput);

			var testStepsAcceptanceCriteriaKVObj = {};  //Final test steps acceptance criteria Key/Value Object

			//Call function to get the set of test steps acceptance criteria for the current test.
			createTestStepsAcceptanceCriteria(testStepsAcceptanceCriteriaKVObj, testAcceptanceCriteria);

			if ( isEmpty(testStepsKVObj) ) {  // Test does not have test steps defined.

				// Note:  MS Excel does not like spaces after the comma on a CSV file so, "," NOT ", "
				var rowString =
					testName + "," +
					cleanTestStep + "," +
					cleanTestStepAcceptanceCriteria + "," +
					cleanTestStepInput + "," +
					testLabel + "," +
					testDescription + "," +
					testInputDescription + "," +
					testAcceptanceCriteriaDescription + "," +
					testResults + "," +
					testType + "," +
					testCaseName + "," +
					testCaseGUID
					;
				if (DEBUG) { Session.Output( "  DEBUG: Current Row to Export: " + rowString )};
				CSVExportRow(rowString);
			}
			else {
				for(var key in testStepsKVObj) {
					if (VERBOSE) { Session.Output( "    VERBOSE:    testStepsKVObj: key: " + key + ": " + testStepsKVObj[key] )};
					var cleanTestStep;
					var cleanTestStepInput;
					var cleanTestStepAcceptanceCriteria;

					// Clean up the cruft.
					cleanTestStep = __SafeCSVString(testStepsKVObj[key]);
					if (VERBOSE) { Session.Output( "    VERBOSE:   CleanStep:  " + cleanTestStep)};
					cleanTestStepInput = __SafeCSVString(testStepsInputsKVObj[key]);
					if (VERBOSE) { Session.Output( "    VERBOSE:   CleanTestStepInput:  " + cleanTestStepInput)};
					cleanTestStepAcceptanceCriteria = __SafeCSVString(testStepsAcceptanceCriteriaKVObj[key]);
					if (!DEBUG) { Session.Output("    Test Steps : " + key + "  :  " + testStepsKVObj[key] + " : " + cleanTestStepInput + ": " + cleanTestStepAcceptanceCriteria ) };
					// Note:  MS Excel does not like spaces after the comma on a CSV file so, "," NOT ", "
					var rowString =
						testName + "," +
						cleanTestStep + "," +
						cleanTestStepAcceptanceCriteria + "," +
						cleanTestStepInput + "," +
						testLabel + "," +
						testDescription + "," +
						testInputDescription + "," +
						testAcceptanceCriteriaDescription + "," +
						testResults + "," +
						testType + "," +
						testCaseName + "," +
						testCaseGUID
						;
					if (DEBUG) { Session.Output( "  DEBUG: Current Row to Export: " + rowString )};
					CSVExportRow(rowString);
				}
			}
			test = null; // Clean up for next iteration.
		}
		tests = null;
		if (DEBUG) { Session.Output( "  DEBUG: Done!" )};
	}
	else
	{
		// No item selected in the tree, or the item selected was not an element
		Session.Prompt( "This script requires an element be selected in the Project Browser.\n" +
				"Please select an element in the Project Browser and try again.", promptOK );
	}
}

function createTestSteps(testStepsKVObj, currentTestNote) {
	// Check if there are parse tokens defined before proceeding, return if there are no parse tokens.
	if (!testStepsParseToken_regex.test(currentTestNote)) {
		return; //If the parse token is not there just return.
	}

	currentTestNote = currentTestNote.replace(/(?:<include>)/gm,"[include]");
	currentTestNote = currentTestNote.replace(/(?:<exclude>)/gm,"[exclude]");
	//currentTestNote = currentTestNote.replace(/(?:\r\n\tUses:   )/gm,"  Uses:   ");
	currentTestNote = removeHTMLTags(currentTestNote);
	if (VERBOSE) { Session.Output( "  DEBUG: \nStart:")};
	if (VERBOSE) { Session.Output( "  DEBUG: CurrentTestNote: " + currentTestNote)};
	if (VERBOSE) { Session.Output( "  DEBUG: \nEnd:")};
	var testSteps = currentTestNote.match(testNotesSteps_regex)[1];
	if (VERBOSE) { Session.Output(typeof(testSteps))};

	//These REGEX try to get ride of any empty lines in the testSteps string object.  They may need some more thought.
	testSteps = testSteps.replace(/(?:\r\n\tUses:)/gm,"  Uses:");
	testSteps = testSteps.replace(/(\r\n){2,}/gm,"\r\n");
	testSteps = testSteps.replace(/\s*(?:\r\n)+$/m, "");
	testSteps = testSteps.replace(/Alternate:\r\n/m, "");
	testSteps = testSteps.replace(/Continues:\r\n/m, "");
	testSteps = testSteps.replace(/Exception:\r\n/m, "");
	testSteps = testSteps.replace(/^When.*\r?\n?$/m, "");

	if (DEBUG) { Session.Output( "  DEBUG: Dump testSteps: " + testSteps + "\nEND")};
	if (VERBOSE) { Session.Output( "  VERBOSE: Dump testSteps: " + encodeURIComponent(testSteps) + "\nEND")};

	//Split testSteps string into an array for processing.
	var tempTestStepsArray = testSteps.split('\r\n');
	if (VERBOSE) { Session.Output( "  DEBUG: tempTestStepsArray[0]: " + tempTestStepsArray[0] + "\nEND")};
	if (VERBOSE) { Session.Output( "  DEBUG: tempTestStepsArray: \n" + tempTestStepsArray + "\nLength: " + tempTestStepsArray.length + "\nEND")};

	// for loop to iterate through the tempTestStepsArray and populate KV object.  tempTestStepsArray[0] contains parsing tokens "Start:"
	for(var testStepsIterator = 1, testStepsCount = tempTestStepsArray.length; testStepsIterator < testStepsCount; testStepsIterator++)
	{
		if(new RegExp(lineNumbers_regex).test(tempTestStepsArray[testStepsIterator])){
			var lineNumber = tempTestStepsArray[testStepsIterator].match(lineNumbers_regex)[1];
		}
		else {
			Session.Output( "    ERROR: Processing Step: Step has missing line number");
			Session.Output( "    ERROR: Current Test Step: " + encodeURIComponent(tempTestStepsArray[testStepsIterator]));
			Session.Output( "\n");
			break;
		}
		if(new RegExp(testStepDetail_regex).test(tempTestStepsArray[testStepsIterator])){
			var testStepsDetail = tempTestStepsArray[testStepsIterator].match(testStepDetail_regex)[1];
			testStepsKVObj[lineNumber] = testStepsDetail;
		}
		else {
			Session.Output("    ERROR Processing Step: Step has missing step details");
			Session.Output( "   ERROR: Current Test Step: " + encodeURIComponent(tempTestStepsArray[testStepsIterator]) + "\n");
			Session.Output( "\n");
			break;
		}

		//var lineNumber = tempTestStepsArray[testStepsIterator].match(lineNumbers_regex)[1];
		//var testStepsDetail = tempTestStepsArray[testStepsIterator].match(testStepDetail_regex)[1];
		//testStepsKVObj[lineNumber] = testStepsDetail;
		if (VERBOSE) { Session.Output( "  DEBUG:      " + tempTestStepsArray[testStepsIterator])};
		if (VERBOSE) { Session.Output( "  DEBUG:         TestStepNumber: " + lineNumber + "TestStepDetail: " + encodeURIComponent(testStepsDetail) )};
	}
}

function createTestStepsInputs(testStepsInputsKVObj, testInput) {
	// Check if there are parse tokens defined before proceeding, return if there are no parse tokens.
	if (!testInputParseToken_regex.test(testInput)) {
		if (VERBOSE) { Session.Output("NO INPUT PARSE TOKEN")};
		return; //If the parse token is not there just return.
	}

	// Use the capture group [1] for everything after TEST_STEP_INPUT_DATA token
	var testStepsInputs = testInput.match(testInputsSteps_regex)[1]; // [1] gets the steps capture group
	if (VERBOSE) { Session.Output( "    VERBOSE: testStepsInputs Before Regex: \n" +testStepsInputs)};
	testStepsInputs = testStepsInputs.replace(/^[ \t\n\r]+/g,""); //No Multi-line on this one. For each line in string remove leading white space.
	testStepsInputs = testStepsInputs.replace(/^(?:\r\n|\r|\n|\t| )+$/gm,""); //Empty lines with \s white space characters
	testStepsInputs = testStepsInputs.replace(/^When.*\r\n/m, "");
	//testStepsInputs = testStepsInputs.replace(/^(?:\r\n|\r|\n|\t| )+/gm,""); //Lines with \s white space characters at the front of the string
	//testStepsInputs = testStepsInputs.replace(/(?:\r\n|\r|\n|\t| )+$/gm,""); //Lines with \s white space characters at the end of the string
	//testStepsInputs = testStepsInputs.replace(/(\r\n){2,}/gm,"\r\n");
	//testStepsInputs = testStepsInputs.replace(/\s*(?:\r\n)+$/m, "");

	if (VERBOSE) { Session.Output( "    VERBOSE: TestStepsInputs After Regex: " + testStepsInputs)};
	if (VERBOSE) { Session.Output( "    VERBOSE: TestStepsInputs Var: " + encodeURIComponent(testStepsInputs) + testStepsInputs.length)};

	var tempTestStepsInputsArray = testStepsInputs.split('\n');
	if (VERBOSE) { Session.Output( "    VERBOSE: tempTestStepsInputsArray: \n" + tempTestStepsInputsArray + "\nLength: " + tempTestStepsInputsArray.length + "\nEnd")};
	if (VERBOSE) { Session.Output( "    VERBOSE: tempTestStepsInputsArray[0]: " + tempTestStepsInputsArray[0] + "\nEnd")};

	if (tempTestStepsInputsArray.length > 0 ) {
		for(var testStepsInputsIterator = 0, testStepsInputsCount = tempTestStepsInputsArray.length; testStepsInputsIterator < testStepsInputsCount; testStepsInputsIterator++)
		{
			if (VERBOSE) { Session.Output( "    VERBOSE: tempTestStepsInputsArray: " + testStepsInputsIterator + " : " + testStepsInputsCount + " : " + tempTestStepsInputsArray[testStepsInputsIterator])};
			if (VERBOSE) { Session.Output( "    VERBOSE: Current Array Item: " + encodeURIComponent(tempTestStepsInputsArray[testStepsInputsIterator]))};
			if (VERBOSE) { Session.Output( "    VERBOSE: " + tempTestStepsInputsArray[testStepsInputsIterator].match(lineNumbers_regex))};

			// Get the "number" of the input step.  Gonna use this to align input steps to the numbered steps.
			if(new RegExp(lineNumbers_regex).test(tempTestStepsInputsArray[testStepsInputsIterator])){
				var lineNumber = tempTestStepsInputsArray[testStepsInputsIterator].match(lineNumbers_regex)[1];
				if (DEBUG) { Session.Output( "  DEBUG: Input Step Line Number: " + lineNumber + "\n" ) };
			}
			else {
				Session.Output( "    ERROR: Processing Input Steps: Step has missing line number");
				Session.Output( "    ERROR: Current Test Input Step: " + encodeURIComponent(tempTestStepsInputsArray[testStepsInputsIterator]));
				Session.Output( "\n");
				break;
			}
			if(new RegExp(testStepDetail_regex).test(tempTestStepsInputsArray[testStepsInputsIterator])){
				var testStepsInputsDetail = tempTestStepsInputsArray[testStepsInputsIterator].match(testStepDetail_regex)[1];
				testStepsInputsKVObj[lineNumber] = testStepsInputsDetail;
				if (DEBUG) { Session.Output( "  DEBUG: Input Step: " + lineNumber + " : " + testStepsInputsDetail + "\n" ) };
			}
			else {
				Session.Output("    ERROR Processing Input Steps: Step has missing step details");
				Session.Output( "   ERROR: Current Test Input Step: " + encodeURIComponent(tempTestStepsInputsArray[testStepsInputsIterator]));
				Session.Output( "\n");
				break;
			}

			if (VERBOSE) { Session.Output( "    VERBOSE: Test Step Input TestStepNumber: " + lineNumber + "  testStepsInputsDetail: " + encodeURIComponent(testStepsInputsDetail) )};
		}
	}
}

function createTestStepsAcceptanceCriteria(testStepsAcceptanceCriteriaKVObj, testAcceptanceCriteria) {
	// Check if there are parse tokens defined before proceeding, return if there are no parse tokens.
	if (!testStepsAcceptanceCriteria_regex.test(testAcceptanceCriteria)) {
		if (VERBOSE) { Session.Output("    VERBOSE:    Parsing token missing.  Add 'NRS_TEST_STEP_RESULTS' to the Acceptance Criteria tab in Sparx EA.")};
		return; //If the parse token is not there just return.
	}
	// Prepare Test Step Acceptance Criteria Array.
	// Create a capture group for everything after NRS_TEST_STEP_RESULT token
	var testStepsAcceptanceCriteria = testAcceptanceCriteria.match(testStepsAcceptanceCriteria_regex)[1]; // [1] gets the steps capture group

	//testStepsAcceptanceCriteria = testStepsAcceptanceCriteria.replace(/^[ \t\n\r]*$/gm,"");
	testStepsAcceptanceCriteria = testStepsAcceptanceCriteria.replace(/^[ \t\n\r]+/g,""); //No Multi-line on this one. For each line in string remove leading white space.
	testStepsAcceptanceCriteria = testStepsAcceptanceCriteria.replace(/^(?:\r\n|\r|\n|\t| )+$/gm,""); //Empty lines with \s white space characters

	var tempTestStepsAcceptanceCriteriaArray = testStepsAcceptanceCriteria.split('\n');
	if (VERBOSE) { Session.Output( "    VERBOSE: tempTestStepsAcceptanceCriteriaArray: \n" + tempTestStepsAcceptanceCriteriaArray + "Length: " + tempTestStepsAcceptanceCriteriaArray.length + "\nEnd")};
	if (tempTestStepsAcceptanceCriteriaArray.length > 0 ) {
		for(var testStepAcceptanceCriteriaIterator = 1, testStepAcceptanceCriteriaCount = tempTestStepsAcceptanceCriteriaArray.length; testStepAcceptanceCriteriaIterator < testStepAcceptanceCriteriaCount; testStepAcceptanceCriteriaIterator++)
		{
			if(new RegExp(lineNumbers_regex).test(tempTestStepsAcceptanceCriteriaArray[testStepAcceptanceCriteriaIterator])){
				var lineNumber = tempTestStepsAcceptanceCriteriaArray[testStepAcceptanceCriteriaIterator].match(lineNumbers_regex)[1];
			}
			else {
				Session.Output( "    ERROR: Processing Step Acceptance Criteria: Step has missing line number");
				Session.Output( "    ERROR: Current Test Step AC: " + encodeURIComponent(tempTestStepsAcceptanceCriteriaArray[testStepAcceptanceCriteriaIterator]));
				Session.Output( "\n");
				break;
			}
			if(new RegExp(testStepDetail_regex).test(tempTestStepsAcceptanceCriteriaArray[testStepAcceptanceCriteriaIterator])){
				var testStepsAcceptanceCriteriaDetail = tempTestStepsAcceptanceCriteriaArray[testStepAcceptanceCriteriaIterator].match(testStepDetail_regex)[1];
				if (DEBUG) { Session.Output( "  DEBUG: AC Step: " + lineNumber + " : " + testStepsAcceptanceCriteriaDetail + "\n" ) };
				testStepsAcceptanceCriteriaKVObj[lineNumber] = testStepsAcceptanceCriteriaDetail;
			}
			else {
				Session.Output("    ERROR Processing Step Acceptance Criteria: Step has missing step details");
				Session.Output( "   ERROR: Current Test Step AC: " + encodeURIComponent(tempTestStepsAcceptanceCriteriaArray[testStepAcceptanceCriteriaIterator]));
				Session.Output( "\n");
				break;
			}

			//var lineNumber = tempTestStepsAcceptanceCriteriaArray[testStepAcceptanceCriteriaIterator].match(lineNumbers_regex)[1];
			//var testStepsAcceptanceCriteriaDetail = tempTestStepsAcceptanceCriteriaArray[testStepAcceptanceCriteriaIterator].match(testStepDetail_regex)[1];
			//testStepsAcceptanceCriteriaKVObj[lineNumber] = testStepsAcceptanceCriteriaDetail;
			if (VERBOSE) { Session.Output( "    VERBOSE: AC Line Number: " + lineNumber[1] + "  Iterator: " +  testStepAcceptanceCriteriaIterator) };
		}
	}
}

function GetModelName(contextObject){

	var currentObject = contextObject;
	//Session.Output("CO: " + currentObject.Name + "  COid: " + currentObject.ID + "  COType: " +currentObject.ObjectType + " ParentID: " + currentObject.ParentID + "\n");
	if ( currentObject != null && currentObject.ObjectType == otElement && currentObject.ParentID == 0 )
	{
		if (VERBOSE) { Session.Output("Context Item is an element: " + currentObject.Name + "\n") };
		currentObject = Repository.GetPackageByID(currentObject.PackageID);
	}
	while (currentObject != null && currentObject.ObjectType == otPackage && currentObject.ParentID != 0) {
		currentObject = Repository.GetPackageByID(currentObject.ParentID);
	}
	return currentObject.Name;
}

function CSVExportInitialize( fileName /* : String */ ) /* : void */
{
	if ( !exportIsExporting )
	{
		// Switch into exporting mode
		exportIsExporting = true;

		// Setup file object and column array
		var fsObject = new ActiveXObject( "Scripting.FileSystemObject" );
		exportFile = fsObject.CreateTextFile( fileName, true );
	}
	else
	{
		LOGWarning( "CSV Export is already in progress" );
	}
}

function CSVExportFinalize() /* : void */
{
	if ( exportIsExporting )
	{
		// Clean up file object and column array
		exportFile.Close();
		exportFile = null;
		// Switch out of exporting mode
		exportIsExporting = false;
	}
	else
	{
		LOGWarning( "CSV Export is not currently in progress" );
	}
}

function CSVExportRow( rowString /* : String */ ) /* : void */
{
	if ( exportIsExporting )
	{
		// Output to file
		exportFile.WriteLine( rowString );
	}
	else
	{
		LOGWarning( "CSV Export is not currently in progress. Call CSVExportInitialize() to start a CSV Export" );
	}
}

function __SafeCSVString( originalString /* : String */ ) /* : String */
{
	var returnString = new String(originalString);

	// Strip out delimiters
	var delimiterRegExp = new RegExp( CSV_DELIMITER, "gm" );
	returnString = returnString.replace( delimiterRegExp, "" );

	var dosNewlineRegExp = new RegExp( "(\r\n)+", "gm" );
	returnString = returnString.replace( dosNewlineRegExp, "" );

	var newlineRegExp = new RegExp( "(\n)+", "gm" );
	returnString = returnString.replace( newlineRegExp, "" );

	var carriageRtnRegExp = new RegExp( "\r", "gm" );
	returnString = returnString.replace( carriageRtnRegExp, "" );

	var httpRegExp = new RegExp( "<[^>]*>", "gm" );
	returnString = returnString.replace( httpRegExp, "" );

	var lessgreaterthanRegExp = new RegExp( "\&[lg]t\;", "gm" );
	returnString = returnString.replace( lessgreaterthanRegExp, "" );

	var doubleQuoteRegExp = new RegExp( "\"", "gm" );
	returnString = returnString.replace( doubleQuoteRegExp, "" );

	returnString = returnString.replace(/^\s+|\s+$/g,""); //Trim

	returnString = "\"" + returnString + "\"";

	return returnString;
}

function removeHTMLTags(originalString /* : String */){

	var strInputCode = originalString;
	/*
	   This line is optional, it replaces escaped brackets with real ones,
	   i.e. &lt; is replaced with < and &gt; is replaced with >
	   */
	strInputCode = strInputCode.replace(/&(lt|gt);/g, function (strMatch, p1){
			return (p1 == "lt")? "<" : ">";
			});
	var strTagStrippedText = strInputCode.replace(/<\/?[^>]+(>|$)/g, "");
	if (VERBOSE) { Session.Output( "    VERBOSE: removeHTMLTags Input:\n" + strInputCode + "\n\nremoveHTMLTags Output:\n" + strTagStrippedText)};
	return strTagStrippedText;
}

var type = (function(global) {
		var cache = {};
		return function(obj) {
		var key;
		return obj === null ? 'null' // null
		: obj === global ? 'global' // window in browser or global in nodejs
		: (key = typeof obj) !== 'object' ? key // basic: string, boolean, number, undefined, function
		: obj.nodeType ? 'object' // DOM element
		: cache[key = ({}).toString.call(obj)] // cached. date, regexp, error, object, array, math
		|| (cache[key] = key.slice(8, -1).toLowerCase()); // get XXXX from [object XXXX], and cache it
		};
		}(this));

var isEmpty = function(obj) {
	for(var p in obj){
		return false;
	}
	return true;
};

main();
