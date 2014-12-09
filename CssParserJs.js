/*jslint vars: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, require, module */
(this.define || function (f) { "use strict"; var n = "CssParserJs", r = f((typeof (require) === "undefined") ? function () { } : require); if ((typeof (module) !== "undefined") && module.exports) { module.exports = r; } else { this[n] = r; } }).call(this, function (require) {

    "use strict";
    
    var CharacterCategorisationOptions, ParseError, characterProcessors, getCharacterPositionStringNavigator, processCharacters, groupCharacters, CssParserJs;
    
    CharacterCategorisationOptions = {
        Comment: 0,
        CloseBrace: 1,
        OpenBrace: 2,
        SemiColon: 3,
        SelectorOrStyleProperty: 4,
        StylePropertyColon: 5, // This is the colon between a Style Property and Value
        Value: 6,
        Whitespace: 7,
        GetNameFor: function (value) {
            var propertyName;
            for (propertyName in CharacterCategorisationOptions) {
                if (CharacterCategorisationOptions.hasOwnProperty(propertyName)) {
                    if (CharacterCategorisationOptions[propertyName] === value) {
                        return propertyName;
                    }
                }
            }
            throw new Error("Invalid CharacterCategorisationOptions: " + value);
        }
    };

    ParseError = function (message, indexInSource) {
        this.message = message;
        this.indexInSource = indexInSource;
    };
    ParseError.prototype = new Error();
    ParseError.prototype.constructor = ParseError;
    ParseError.prototype.name = "ParseError";
    
    characterProcessors = (function () {
        var getCharacterProcessorResult,
            getSkipNextCharacterSegment,
            getSingleLineCommentSegment,
            getMultiLineCommentSegment,
            getMediaQuerySegment,
            getQuotedSegment,
            pseudoClasses,
            isNextWordOneOfThePseudoClasses,
            getBracketedSelectorSegment,
            getSelectorOrStyleSegment;

        getCharacterProcessorResult = function (characterCategorisation, nextProcessor) {
            return {
                CharacterCategorisation: characterCategorisation,
                NextProcessor: nextProcessor
            };
        };

        getSkipNextCharacterSegment = function (characterCategorisation, characterProcessorToReturnTo) {
            return {
                Process: function (stringNavigator) {
                    return getCharacterProcessorResult(
                        characterCategorisation,
                        characterProcessorToReturnTo
                    );
                }
            };
        };

        getSingleLineCommentSegment = function (characterProcessorToReturnTo) {
            var processor = {
                Process: function (stringNavigator) {
                    // For single line comments, the line return should be considered part of the comment content (in the same way that the "/*" and "*/" sequences
                    // are considered part of the content for multi-line comments)
                    if (stringNavigator.DoesCurrentContentMatch("\r\n")) {
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.Comment,
                            getSkipNextCharacterSegment(
                                CharacterCategorisationOptions.Comment,
                                characterProcessorToReturnTo
                            )
                        );
                    } else if ((stringNavigator.CurrentCharacter === "\r") || (stringNavigator.CurrentCharacter === "\n")) {
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.Comment,
                            characterProcessorToReturnTo
                        );
                    }
                    return getCharacterProcessorResult(
                        CharacterCategorisationOptions.Comment,
                        processor
                    );
                }
            };
            return processor;
        };

        getMultiLineCommentSegment = function (characterProcessorToReturnTo) {
            var processor = {
                Process: function (stringNavigator) {
                    if (stringNavigator.DoesCurrentContentMatch("*/")) {
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.Comment,
                            getSkipNextCharacterSegment(
                                CharacterCategorisationOptions.Comment,
                                characterProcessorToReturnTo
                            )
                        );
                    }
                    return getCharacterProcessorResult(
                        CharacterCategorisationOptions.Comment,
                        processor
                    );
                }
            };
            return processor;
        };

        getMediaQuerySegment = function (characterProcessorToReturnTo) {
            var processor = {
                Process: function (stringNavigator) {
                    if (stringNavigator.CurrentCharacter === "{") {
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.OpenBrace,
                            characterProcessorToReturnTo
                        );
                    } else if (stringNavigator.IsWhitespace) {
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.Whitespace,
                            processor
                        );
                    }

                    return getCharacterProcessorResult(
                        CharacterCategorisationOptions.SelectorOrStyleProperty,
                        processor
                    );
                }
            };
            return processor;
        };

        getQuotedSegment = function (quoteCharacter, characterCategorisation, characterProcessorToReturnTo) {
            var processor = {
                Process: function (stringNavigator) {
                    // If the next character is a backslash then the next character should be ignored if it's "special" and just considered  to be another character
                    // in the Value string (particularly important if the next character is an escaped quote)
                    if (stringNavigator.CurrentCharacter === "\\") {
                        return getCharacterProcessorResult(
                            characterCategorisation,
                            getSkipNextCharacterSegment(
                                characterCategorisation,
                                processor
                            )
                        );
                    }

                    // If this is the closing quote character then include it in the Value and then return to the previous processor
                    if (stringNavigator.CurrentCharacter === quoteCharacter) {
                        return getCharacterProcessorResult(
                            characterCategorisation,
                            characterProcessorToReturnTo
                        );
                    }

                    return getCharacterProcessorResult(
                        characterCategorisation,
                        processor
                    );
                }
            };
            return processor;
        };

        pseudoClasses = [
            "lang",
            "link",
            "after",
            "focus",
            "hover",
            "active",
            "before",
            "visited",
            "first-line",
            "first-child",
            "first-letter",
            "last-child",
            "nth-child",
            "checked",
            "disabled",
            "empty",
            "enabled",
            "first-of-type",
            "focus",
            "in-range",
            "invalid",
            "last-of-type",
            "not",
            "nth-last-child",
            "nth-last-of-type",
            "nth-of-type",
            "only-of-type",
            "only-child",
            "optional",
            "out-of-range",
            "read-only",
            "read-write",
            "required",
            "root",
            "target",
            "valid"
        ];

        isNextWordOneOfThePseudoClasses = function (stringNavigator) {
            // Skip over any whitespace to find the start of the next content
            while (stringNavigator.IsWhitespace) {
                stringNavigator = stringNavigator.GetNext();
            }
            return pseudoClasses.some(function (pseudoClass) {
                return stringNavigator.DoesCurrentContentMatch(pseudoClass);
            });
        };

        getBracketedSelectorSegment = function (supportSingleLineComments, closeBracketCharacter, processorToReturnTo) {
            var optionalCharacterCategorisationBehaviourOverride = {
                EndOfBehaviourOverrideCharacter: closeBracketCharacter,
                CharacterCategorisation: CharacterCategorisationOptions.SelectorOrStyleProperty,
                CharacterProcessorToReturnTo: processorToReturnTo
            };
            return getSelectorOrStyleSegment(false, supportSingleLineComments, optionalCharacterCategorisationBehaviourOverride);
        };

        getSelectorOrStyleSegment = function (processAsValueContent, supportSingleLineComments, optionalCharacterCategorisationBehaviourOverride) {
            var processor;
            function getSelectorOrStyleCharacterProcessor() {
                if (!processAsValueContent) {
                    return processor;
                }
                return getSelectorOrStyleSegment(false, supportSingleLineComments, null);
            }
            function getValueCharacterProcessor() {
                if (processAsValueContent) {
                    return processor;
                }
                return getSelectorOrStyleSegment(true, supportSingleLineComments, null);
            }
            processor = {
                Process: function (stringNavigator) {
                    var nextCharacter, closingBracketCharacter;

                    // Is this the end of the section that the optionalCharacterCategorisationBehaviourOverride (if non-null) is concerned with? If so then drop back
                    // out to the character processor that handed control over to the optionalCharacterCategorisationBehaviourOverride.
                    if (optionalCharacterCategorisationBehaviourOverride
                            && (stringNavigator.CurrentCharacter === optionalCharacterCategorisationBehaviourOverride.EndOfBehaviourOverrideCharacter)) {
                        return getCharacterProcessorResult(
                            optionalCharacterCategorisationBehaviourOverride.CharacterCategorisation,
                            optionalCharacterCategorisationBehaviourOverride.CharacterProcessorToReturnTo
                        );
                    }

                    // Deal with other special characters (bearing in mind the altered interactions if optionalCharacterCategorisationBehaviourOverride is non-null)
                    if (stringNavigator.CurrentCharacter === "{") {
                        if (optionalCharacterCategorisationBehaviourOverride) {
                            return getCharacterProcessorResult(
                                optionalCharacterCategorisationBehaviourOverride.CharacterCategorisation,
                                processor
                            );
                        }
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.OpenBrace,
                            getSelectorOrStyleCharacterProcessor()
                        );
                    } else if (stringNavigator.CurrentCharacter === "}") {
                        if (optionalCharacterCategorisationBehaviourOverride) {
                            return getCharacterProcessorResult(
                                optionalCharacterCategorisationBehaviourOverride.CharacterCategorisation,
                                processor
                            );
                        }
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.CloseBrace,
                            getSelectorOrStyleCharacterProcessor()
                        );
                    } else if (stringNavigator.CurrentCharacter === ";") {
                        if (optionalCharacterCategorisationBehaviourOverride) {
                            return getCharacterProcessorResult(
                                optionalCharacterCategorisationBehaviourOverride.CharacterCategorisation,
                                processor
                            );
                        }
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.SemiColon,
                            getSelectorOrStyleCharacterProcessor()
                        );
                    } else if (stringNavigator.CurrentCharacter === ":") {
                        if (optionalCharacterCategorisationBehaviourOverride) {
                            return getCharacterProcessorResult(
                                optionalCharacterCategorisationBehaviourOverride.CharacterCategorisation,
                                processor
                            );
                        }

                        // If the colon indicates a pseudo-class for a selector then we want to continue processing it as a selector and not presume that the content
                        // type has switched to a value (this is more complicated with LESS nesting to support, if it was just CSS  then things would have been easier!)
                        if (!processAsValueContent && isNextWordOneOfThePseudoClasses(stringNavigator.GetNext())) {
                            return getCharacterProcessorResult(
                                CharacterCategorisationOptions.SelectorOrStyleProperty,
                                getSelectorOrStyleCharacterProcessor()
                            );
                        }
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.StylePropertyColon,
                            getValueCharacterProcessor()
                        );
                    } else if (stringNavigator.IsWhitespace) {
                        if (optionalCharacterCategorisationBehaviourOverride) {
                            return getCharacterProcessorResult(
                                optionalCharacterCategorisationBehaviourOverride.CharacterCategorisation,
                                processor
                            );
                        }
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.Whitespace,
                            processor
                        );
                    }

                    // To deal with comments we use specialised comment-handling processors (even if an optionalCharacterCategorisationBehaviourOverride is
                    // specified we still treat deal with comments as normal, their content is not forced into a different categorisation)
                    if (stringNavigator.CurrentCharacter === "/") {
                        nextCharacter = stringNavigator.GetNext().CurrentCharacter;
                        if (supportSingleLineComments && (nextCharacter === "/")) {
                            return getCharacterProcessorResult(
                                CharacterCategorisationOptions.Comment,
                                getSingleLineCommentSegment(processor)
                            );
                        } else if (nextCharacter === "*") {
                            return getCharacterProcessorResult(
                                CharacterCategorisationOptions.Comment,
                                getMultiLineCommentSegment(processor)
                            );
                        }
                    }

                    // Although media query declarations will be marked as SelectorOrStyleProperty content, special handling is required to ensure that any colons
                    // that exist in it are identified as part of the SelectorOrStyleProperty and not marked as a StylePropertyColon
                    if (!processAsValueContent && stringNavigator.DoesCurrentContentMatch("@media")) {
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.SelectorOrStyleProperty,
                            getMediaQuerySegment(processor)
                        );
                    }

                    if ((stringNavigator.CurrentCharacter === "\"") || (stringNavigator.CurrentCharacter === "'")) {
                        // If an optionalCharacterCategorisationBehaviourOverride was specified then the content will be identified as whatever categorisation
                        // is specified by it, otherwise it will be identified as being CharacterCategorisationOptions.Value
                        if (optionalCharacterCategorisationBehaviourOverride) {
                            return getCharacterProcessorResult(
                                optionalCharacterCategorisationBehaviourOverride.CharacterCategorisation,
                                getQuotedSegment(
                                    stringNavigator.CurrentCharacter,
                                    optionalCharacterCategorisationBehaviourOverride.CharacterCategorisation,
                                    processor
                                )
                            );
                        }
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.Value,
                            getQuotedSegment(
                                stringNavigator.CurrentCharacter,
                                CharacterCategorisationOptions.Value,
                                getValueCharacterProcessor()
                            )
                        );
                    }

                    // If we're currently processing StyleOrSelector content and we encounter a square or round open bracket then we're about to enter an attribute
                    // selector (eg. "a[href]") or a LESS mixin argument set (eg. ".RoundedCorners (@radius"). In either case we need to consider all content until
                    // the corresponding close bracket to be a StyleOrSelector, whether it's whitespace or a quoted section (note: not if it's a comment, that still
                    // gets identified as comment content).
                    if (!processAsValueContent) {
                        if (stringNavigator.CurrentCharacter === "[") {
                            closingBracketCharacter = "]";
                        } else if (stringNavigator.CurrentCharacter === "(") {
                            closingBracketCharacter = ")";
                        } else {
                            closingBracketCharacter = null;
                        }
                        if (closingBracketCharacter) {
                            return getCharacterProcessorResult(
                                CharacterCategorisationOptions.SelectorOrStyleProperty,
                                getBracketedSelectorSegment(
                                    supportSingleLineComments,
                                    closingBracketCharacter,
                                    processor
                                )
                            );
                        }
                    }

                    // If it's not a quoted or bracketed section, then we can continue to use this instance to process the content
                    return getCharacterProcessorResult(
                        processAsValueContent ? CharacterCategorisationOptions.Value : CharacterCategorisationOptions.SelectorOrStyleProperty,
                        processor
                    );
                }
            };
            return processor;
        };

        return {
            GetNewCssProcessor: function () {
                return getSelectorOrStyleSegment(false, false, null);
            },
            GetNewLessProcessor: function () {
                return getSelectorOrStyleSegment(false, true, null);
            }
        };
    }());
    
    getCharacterPositionStringNavigator = function (value, index) {
        var
            bPastEndOfContent = (index >= value.length),
            stringNavigator = {
                CurrentCharacter: bPastEndOfContent ? null : value.charAt(index),
                IsWhitespace: bPastEndOfContent ? false : /\s/.test(value.charAt(index)),
                DoesCurrentContentMatch: function (checkFor) {
                    if (!checkFor) {
                        return false;
                    }
                    return value.substr(index, checkFor.length) === checkFor;
                }
            };
        if (bPastEndOfContent) {
            stringNavigator.GetNext = function () {
                return stringNavigator;
            };
        } else {
            stringNavigator.GetNext = function () {
                return getCharacterPositionStringNavigator(value, index + 1);
            };
        }
        return stringNavigator;
    };
    
    processCharacters = function (processor, value) {
        var characterResultDetails,
            allCharacterResultDetails = [],
            stringNavigator = getCharacterPositionStringNavigator(value, 0);
        while (stringNavigator.CurrentCharacter) {
            characterResultDetails = processor.Process(stringNavigator);
            allCharacterResultDetails.push({
                Character: stringNavigator.CurrentCharacter,
                CharacterCategorisation: characterResultDetails.CharacterCategorisation
            });
            stringNavigator = stringNavigator.GetNext();
            processor = characterResultDetails.NextProcessor;
        }
        return allCharacterResultDetails;
    };
    
    groupCharacters = function (arrCategorisedCharacters) {
        var groupedCharacterStrings = [],
            characterResultDetails = {
                CharacterCategorisation: null,
                Characters: [],
                IndexInSource: null
            };
        
        arrCategorisedCharacters.forEach(function (categorisedCharacterDetails, index) {
            var characterShouldNotBeGrouped = (
                (categorisedCharacterDetails.CharacterCategorisation === CharacterCategorisationOptions.CloseBrace) ||
                (categorisedCharacterDetails.CharacterCategorisation === CharacterCategorisationOptions.OpenBrace) ||
                (categorisedCharacterDetails.CharacterCategorisation === CharacterCategorisationOptions.SemiColon)
            );
            if ((categorisedCharacterDetails.CharacterCategorisation === characterResultDetails.CharacterCategorisation) && !characterShouldNotBeGrouped) {
                characterResultDetails.Characters.push(categorisedCharacterDetails.Character);
                return;
            }
            
            if (characterResultDetails.Characters.length > 0) {
                groupedCharacterStrings.push({
                    CharacterCategorisation: characterResultDetails.CharacterCategorisation,
                    Value: characterResultDetails.Characters.join(""),
                    IndexInSource: characterResultDetails.IndexInSource
                });
            }
            
            if (characterShouldNotBeGrouped) {
                groupedCharacterStrings.push({
                    CharacterCategorisation: categorisedCharacterDetails.CharacterCategorisation,
                    Value: categorisedCharacterDetails.Character,
                    IndexInSource: index
                });
                characterResultDetails = {
                    CharacterCategorisation: null,
                    Characters: [],
                    IndexInSource: null
                };
            } else {
                characterResultDetails = {
                    CharacterCategorisation: categorisedCharacterDetails.CharacterCategorisation,
                    Characters: [ categorisedCharacterDetails.Character ],
                    IndexInSource: index
                };
            }
        });
        
        if (characterResultDetails.Characters.length > 0) {
            groupedCharacterStrings.push({
                CharacterCategorisation: characterResultDetails.CharacterCategorisation,
                Value: characterResultDetails.Characters.join(""),
                IndexInSource: characterResultDetails.IndexInSource
            });
        }
        
        return groupedCharacterStrings;
    };
    
    CssParserJs = {
        CharacterCategorisationOptions: CharacterCategorisationOptions,
        ParseError: ParseError,
        ParseCss: function (value) {
            return groupCharacters(processCharacters(characterProcessors.GetNewCssProcessor(), value));
        },
        ParseLess: function (value) {
            return groupCharacters(processCharacters(characterProcessors.GetNewLessProcessor(), value));
        }
    };

    // Now that the CssParserJs reference has been prepared, with the basic character categorisation, the next layer is added to the API, where
    // content is parsed into a hierarchical structure
    (function () {
        var selectorBreaker,
            objHierarchicalParser,
            FragmentCategorisationOptions;

        selectorBreaker = (function () {
            var CharacterCategorisationOptions,
                getSelectorProcessorResult,
                getDefaultSelectorProcessor,
                getAttributeSelectorProcessor,
                getQuotedSelectorProcessor;

            CharacterCategorisationOptions = {
                EndOfSelector: 0,
                EndOfSelectorSegment: 1,
                SelectorSegment: 2
            };

            getSelectorProcessorResult = function (characterCategorisation, nextProcessor) {
                return {
                    CharacterCategorisation: characterCategorisation,
                    NextProcessor: nextProcessor
                };
            };

            getDefaultSelectorProcessor = function () {
                var processor = {
                    Process: function (currentCharacter) {
                        if (/\s/.test(currentCharacter)) {
                            return getSelectorProcessorResult(CharacterCategorisationOptions.EndOfSelectorSegment, processor);
                        } else if (currentCharacter === ",") {
                            return getSelectorProcessorResult(CharacterCategorisationOptions.EndOfSelector, processor);
                        } else if (currentCharacter === "[") {
                            return getSelectorProcessorResult(CharacterCategorisationOptions.SelectorSegment, getAttributeSelectorProcessor(processor));
                        } else {
                            return getSelectorProcessorResult(CharacterCategorisationOptions.SelectorSegment, processor);
                        }
                    }
                };
                return processor;
            };

            getAttributeSelectorProcessor = function (processorToReturnTo) {
                var processor = {
                    Process: function (currentCharacter) {
                        if ((currentCharacter === "\"") || (currentCharacter === "'")) {
                            return getSelectorProcessorResult(CharacterCategorisationOptions.SelectorSegment, getQuotedSelectorProcessor(processor, currentCharacter, false));
                        } else if (currentCharacter === "]") {
                            return getSelectorProcessorResult(CharacterCategorisationOptions.SelectorSegment, processorToReturnTo);
                        } else {
                            return getSelectorProcessorResult(CharacterCategorisationOptions.SelectorSegment, processor);
                        }
                    }
                };
                return processor;
            };

            getQuotedSelectorProcessor = function (processorToReturnTo, quoteCharacterCharacter, nextCharacterIsEscaped) {
                var processor = {
                    Process: function (currentCharacter) {
                        if (nextCharacterIsEscaped) {
                            return getSelectorProcessorResult(CharacterCategorisationOptions.SelectorSegment, getQuotedSelectorProcessor(processor, currentCharacter, false));
                        } else if (currentCharacter === quoteCharacterCharacter) {
                            return getSelectorProcessorResult(CharacterCategorisationOptions.SelectorSegment, processorToReturnTo);
                        } else {
                            return getSelectorProcessorResult(CharacterCategorisationOptions.SelectorSegment, processor);
                        }
                    }
                };
                return processor;
            };

            return {
                Break: function (strSelector) {
                    var selectors = [],
                        selectorBuffer = [],
                        selectorsegmentBuffer = [],
                        processor = getDefaultSelectorProcessor(),
                        selectorProcessorResult;

                    // Include an extra character on the end so that there's an extra pass through the loop where the EndOfSelector categorisation is specified (and the
                    // extra character ignored)
                    strSelector.split("").concat([" "]).forEach(function (currentCharacter, index) {
                        if (index === strSelector.length) {
                            selectorProcessorResult = getSelectorProcessorResult(CharacterCategorisationOptions.EndOfSelector, processor);
                        } else {
                            selectorProcessorResult = processor.Process(currentCharacter);
                        }
                        if (selectorProcessorResult.CharacterCategorisation === CharacterCategorisationOptions.SelectorSegment) {
                            selectorsegmentBuffer.push(currentCharacter);
                        } else if (selectorProcessorResult.CharacterCategorisation === CharacterCategorisationOptions.EndOfSelectorSegment) {
                            if (selectorsegmentBuffer.length > 0) {
                                selectorBuffer.push(selectorsegmentBuffer.join(""));
                                selectorsegmentBuffer = [];
                            }
                        } else if (selectorProcessorResult.CharacterCategorisation === CharacterCategorisationOptions.EndOfSelector) {
                            if (selectorsegmentBuffer.length > 0) {
                                selectorBuffer.push(selectorsegmentBuffer.join(""));
                                selectorsegmentBuffer = [];
                            }
                            if (selectorBuffer.length > 0) {
                                selectors.push(selectorBuffer);
                                selectorBuffer = [];
                            }
                        } else {
                            throw new ParseError("Unsupported CharacterCategorisationOptions: " + selectorProcessorResult.CharacterCategorisation, index);
                        }

                        processor = selectorProcessorResult.NextProcessor;
                    });
                    return selectors;
                }
            };
        }());

        objHierarchicalParser = (function () {
            var getSegmentEnumerator,
                getPropertyValueBuffer,
                getSelectorSet,
                trim,
                getNumberOfLineReturnsFromContentIfAny,
                isCommentWithinStylePropertyValue,
                forceIntoMultiLineComment,
                parseIntoStructuredDataPartial;

            getSegmentEnumerator = function (segments) {
                var index = -1;
                return {
                    GetCurrent: function () {
                        return ((index < 0) || (index >= segments.length)) ? null : segments[index];
                    },
                    MoveNext: function () {
                        if (index < segments.length) {
                            index = index + 1;
                        }
                        return (index < segments.length);
                    },
                    TryToPeekAhead: function (positiveOffsetToPeekFor) {
                        var peekIndex = index + positiveOffsetToPeekFor;
                        if (peekIndex >= segments.length) {
                            return {
                                Success: false
                            };
                        }
                        return {
                            Success: true,
                            Value: segments[peekIndex]
                        };
                    }
                };
            };

            getPropertyValueBuffer = function () {
                var stylePropertyValue = null;
                return {
                    Add: function (lastStylePropertyName, propertyValueSegment, sourceLineIndex) {
                        if (stylePropertyValue) {
                            stylePropertyValue.Values.push(propertyValueSegment);
                        } else {
                            stylePropertyValue = {
                                FragmentCategorisation: FragmentCategorisationOptions.StylePropertyValue,
                                Property: lastStylePropertyName,
                                Values: [propertyValueSegment],
                                SourceLineIndex: sourceLineIndex
                            };
                        }
                    },
                    GetHasContent: function () {
                        return !!stylePropertyValue;
                    },
                    ExtractCombinedContentAndClear: function () {
                        if (!stylePropertyValue) {
                            throw new Error("No content to retrieve");
                        }
                        var objValueToReturn = stylePropertyValue;
                        stylePropertyValue = null;
                        return objValueToReturn;
                    }
                };
            };

            getSelectorSet = function (strSelectors) {
                // Using the SelectorBreaker means that any quoting, square brackets or other escaping is taken into account
                var selectors = selectorBreaker.Break(strSelectors),
                    tidiedSelectors = [];
                selectors.forEach(function (selectorsegments) {
                    tidiedSelectors.push(selectorsegments.join(" "));
                });
                return tidiedSelectors;
            };

            trim = function (value) {
                return value.trim ? value.trim() : value.replace(/^\s+|\s+$/g, "");
            };

            getNumberOfLineReturnsFromContentIfAny = function (value) {
                if ((value.indexOf("\r") === -1) && (value.indexOf("\n") === -1)) {
                    return 0;
                }
                return value.match(/\r\n|\r|\n/g).length;
            };
            
            isCommentWithinStylePropertyValue = function (previousFragmentIfAny, segmentEnumerator) {
                // Does the current segment appear to be a comment within a style property value (eg. the "/*red*/" from "color: /*red*/ blue;")?
                // It doesn't count if it comes after the value (eg. "color: blue; // red"), only if it's part of the style property value (since,
                // with the object model we have, that groups all style property value segments into a single fragment, along with a reference to
                // the style property name, and so the comment will have to be considered one of the property value segments).
                if (!previousFragmentIfAny) {
                    return false;
                }
                if ((previousFragmentIfAny.FragmentCategorisation !== CssParserJs.ExtendedLessParser.FragmentCategorisationOptions.StylePropertyName)
                        && (previousFragmentIfAny.FragmentCategorisation !== CssParserJs.ExtendedLessParser.FragmentCategorisationOptions.StylePropertyValue)) {
                    return false;
                }
                var peekOffset = 1;
                while (true) {
                    var peekResult = segmentEnumerator.TryToPeekAhead(peekOffset);
                    if (!peekResult.Success) {
                        return false;
                    }
                    if (peekResult.Value.CharacterCategorisation === CssParserJs.CharacterCategorisationOptions.Value) {
                        return true;
                    }
                    if ((peekResult.Value.CharacterCategorisation !== CssParserJs.CharacterCategorisationOptions.Comment)
                            && (peekResult.Value.CharacterCategorisation !== CssParserJs.CharacterCategorisationOptions.Whitespace)) {
                        return false;
                    }
                    peekOffset += 1;
                }
            };
            
            forceIntoMultiLineComment = function (commentValue) {
                // When a comment is considered to be part of a style property value (eg. "color: /*blue*/ red;"), it must be forced into a multi-line comment format
                // so that the layout of the style property value (in terms of the whitespace between value segments) does not have any semantic meaning. If it was a
                // single-line comment (eg. "color: //blue\n red;") then it would be impossible to render that property value on one line since the "red" segment would
                // get absorbed by the "//blue" comment. For cases where these comments are not of interest to the output (if content is being minified in any way),
                // then the optional argument to the ParseIntoStructuredData method, that excludes comments from the output, may be used.
                if (commentValue.substr(0, 2) === "//") {
                    return "/* " + trim(commentValue.substr(2).replace(/\*\//g, "* /")) + " */";
                }
                return commentValue;
            };

            parseIntoStructuredDataPartial = function (segmentEnumerator, excludeComments, parentSelectorSets, depth, sourceLineIndex) {
                var startingSourceLineIndex = sourceLineIndex,
                    fragments = [],
                    selectorOrStyleContentBuffer = [],
                    selectorOrStyleStartSourceLineIndex = -1,
                    lastStylePropertyName = null,
                    stylePropertyValueBuffer = getPropertyValueBuffer(),
                    currentSegment,
                    selectors,
                    parsedNestedData,
                    selectorOrStyleContent;

                while (segmentEnumerator.MoveNext()) {
                    currentSegment = segmentEnumerator.GetCurrent();
                    switch (currentSegment.CharacterCategorisation) {

                    case CssParserJs.CharacterCategorisationOptions.Comment:
                        if (!excludeComments) {
                            if (isCommentWithinStylePropertyValue(fragments.length > 0 ? fragments[fragments.length - 1] : null, segmentEnumerator)) {
                                // If this comment is a commented-out section of a property value (eg. "color: /*red*/ value;") then, in order to accurately represent
                                // the input in the model that we have (that groups style property values together into a single fragment, along with a reference to
                                // the style property name), the comment has to be considered part of the style property value. If this behaviour is not desired
                                // (if, for example, this parsing step is used to minify content) then the argument may be set that excludes comments.
                                stylePropertyValueBuffer.Add(lastStylePropertyName, forceIntoMultiLineComment(currentSegment.Value), selectorOrStyleStartSourceLineIndex);
                            } else {
                                if (stylePropertyValueBuffer.GetHasContent()) {
                                    fragments.push(stylePropertyValueBuffer.ExtractCombinedContentAndClear());
                                }
                                fragments.push({
                                    FragmentCategorisation: FragmentCategorisationOptions.Comment,
                                    Value: currentSegment.Value,
                                    SourceLineIndex: sourceLineIndex
                                });
                            }
                        }
                        sourceLineIndex += getNumberOfLineReturnsFromContentIfAny(currentSegment.Value);
                        break;

                    case CssParserJs.CharacterCategorisationOptions.Whitespace:
                        if (selectorOrStyleContentBuffer.length > 0) {
                            selectorOrStyleContentBuffer.push(" ");
                        }
                        sourceLineIndex += getNumberOfLineReturnsFromContentIfAny(currentSegment.Value);
                        break;

                    case CssParserJs.CharacterCategorisationOptions.SelectorOrStyleProperty:
                        if (selectorOrStyleContentBuffer.length === 0) {
                            selectorOrStyleStartSourceLineIndex = sourceLineIndex;
                        }
                        selectorOrStyleContentBuffer.push(currentSegment.Value);

                        // If we were building up content for a StylePropertyValue then encountering other content means that the value must have terminated (for valid
                        // CSS it should be only a semicolon or close brace that terminates a value but we're not concerned about invalid CSS here)
                        if (stylePropertyValueBuffer.GetHasContent()) {
                            fragments.push(stylePropertyValueBuffer.ExtractCombinedContentAndClear());
                        }
                        break;

                    case CssParserJs.CharacterCategorisationOptions.OpenBrace:
                        if (selectorOrStyleContentBuffer.length === 0) {
                            throw new ParseError("Encountered OpenBrace with no preceding selector", currentSegment.IndexInSource);
                        }

                        // If we were building up content for a StylePropertyValue then encountering other content means that the value must have terminated (for valid
                        // CSS it should be only a semicolon or close brace that terminates a value but we're not concerned about invalid CSS here)
                        if (stylePropertyValueBuffer.GetHasContent()) {
                            fragments.push(stylePropertyValueBuffer.ExtractCombinedContentAndClear());
                        }

                        selectors = getSelectorSet(selectorOrStyleContentBuffer.join(""));
                        if (selectors.length === 0) {
                            throw new ParseError("Open brace encountered with no leading selector content", currentSegment.IndexInSource);
                        }
                        parsedNestedData = parseIntoStructuredDataPartial(
                            segmentEnumerator,
                            excludeComments,
                            parentSelectorSets.concat([selectors]),
                            depth + 1,
                            sourceLineIndex
                        );
                        fragments.push({
                            FragmentCategorisation: (selectors[0].toLowerCase().substring(0, 6) === "@media")
                                ? FragmentCategorisationOptions.MediaQuery
                                : FragmentCategorisationOptions.Selector,
                            ParentSelectors: parentSelectorSets,
                            Selectors: selectors,
                            ChildFragments: parsedNestedData.Fragments,
                            SourceLineIndex: selectorOrStyleStartSourceLineIndex
                        });
                        sourceLineIndex += parsedNestedData.NumberOfLinesParsed;
                        selectorOrStyleContentBuffer = [];
                        break;

                    case CssParserJs.CharacterCategorisationOptions.CloseBrace:
                        if (depth === 0) {
                            throw new ParseError("Encountered unexpected close brace", currentSegment.IndexInSource);
                        }
                            
                        // If we were building up content for a StylePropertyValue then encountering other content means that the value must have terminated (for valid
                        // CSS it should be only a semicolon or close brace that terminates a value but we're not concerned about invalid CSS here)
                        if (stylePropertyValueBuffer.GetHasContent()) {
                            fragments.push(stylePropertyValueBuffer.ExtractCombinedContentAndClear());
                        }

                        if (selectorOrStyleContentBuffer.length > 0) {
                            fragments.push({
                                FragmentCategorisation: FragmentCategorisationOptions.StylePropertyName,
                                Value: selectorOrStyleContentBuffer.join(""),
                                SourceLineIndex: selectorOrStyleStartSourceLineIndex
                            });
                        }
                        return {
                            Fragments: fragments,
                            NumberOfLinesParsed: sourceLineIndex - startingSourceLineIndex
                        };

                    case CssParserJs.CharacterCategorisationOptions.StylePropertyColon:
                    case CssParserJs.CharacterCategorisationOptions.SemiColon:
                        // If we were building up content for a StylePropertyValue then encountering other content means that the value must have terminated (for valid
                        // CSS it should be only a semicolon or close brace that terminates a value but we're not concerned about invalid CSS here)
                        if (stylePropertyValueBuffer.GetHasContent()) {
                            fragments.push(stylePropertyValueBuffer.ExtractCombinedContentAndClear());
                        }

                        if (selectorOrStyleContentBuffer.length > 0) {
                            selectorOrStyleContent = selectorOrStyleContentBuffer.join("");
                            if (selectorOrStyleContent.toLowerCase().substring(0, 7) === "@import") {
                                fragments.push({
                                    FragmentCategorisation: FragmentCategorisationOptions.Import,
                                    Value: trim(selectorOrStyleContent.substring(7)),
                                    SourceLineIndex: sourceLineIndex
                                });
                                selectorOrStyleContentBuffer = [];
                                break;
                            }

                            // Note: The SemiColon case here probably suggests invalid content, it should only follow a Value segment (ignoring  Comments and WhiteSpace),
                            // so if there is anything in the selectorOrStyleContentBuffer before the SemiColon then it's probably not correct (but we're not validating
                            // for that here, we just don't want to throw anything away!)
                            lastStylePropertyName = {
                                FragmentCategorisation: FragmentCategorisationOptions.StylePropertyName,
                                Value: selectorOrStyleContentBuffer.join(""),
                                SourceLineIndex: selectorOrStyleStartSourceLineIndex
                            };
                            fragments.push(lastStylePropertyName);
                            selectorOrStyleContentBuffer = [];
                        }
                        break;

                    case CssParserJs.CharacterCategorisationOptions.Value:
                        if (selectorOrStyleContentBuffer.length > 0) {
                            selectorOrStyleContent = selectorOrStyleContentBuffer.join("");
                            if (selectorOrStyleContent.toLowerCase().substring(0, 7) === "@import") {
                                selectorOrStyleContentBuffer.push(currentSegment.Value);
                                break;
                            }

                            // This is presumably an error condition, there should be a colon between SelectorOrStyleProperty content and Value content, but we're not
                            // validating here so just lump it all together
                            lastStylePropertyName = {
                                FragmentCategorisation: FragmentCategorisationOptions.StylePropertyName,
                                Value: selectorOrStyleContentBuffer.join(""),
                                SourceLineIndex: selectorOrStyleStartSourceLineIndex
                            };
                            fragments.push(lastStylePropertyName);
                            selectorOrStyleContentBuffer = [];
                        }
                        if (!lastStylePropertyName) {
                            throw new ParseError("Invalid content, orphan style property value encountered", currentSegment.IndexInSource);
                        }
                        stylePropertyValueBuffer.Add(lastStylePropertyName, currentSegment.Value, selectorOrStyleStartSourceLineIndex);
                        break;

                    default:
                        throw new ParseError("Unsupported CharacterCategorisationOptions value: " + currentSegment.CharacterCategorisation, currentSegment.IndexInSource);
                    }
                }

                // If we have any content in the selectorOrStyleContentBuffer and we're hitting a CloseBrace then it's probably invalid content but just stash it away
                // and move on! (The purpose of this work isn't to get too nuts about invalid CSS).
                if (selectorOrStyleContentBuffer.length > 0) {
                    selectors = getSelectorSet(selectorOrStyleContentBuffer.join(""));
                    fragments.push({
                        FragmentCategorisation: (selectors[0].Value.toLowerCase().substring(0, 6) === "@media")
                            ? FragmentCategorisationOptions.MediaQuery
                            : FragmentCategorisationOptions.Selector,
                        ParentSelectors: parentSelectorSets,
                        Selectors: selectors,
                        ChildFragments: [],
                        SourceLineIndex: sourceLineIndex
                    });
                }

                // It's very feasible that there will still be some style property value content in the buffer at this point, so ensure it doesn't get lost
                if (stylePropertyValueBuffer.GetHasContent()) {
                    fragments.push(stylePropertyValueBuffer.ExtractCombinedContentAndClear());
                }

                return {
                    Fragments: fragments,
                    NumberOfLinesParsed: sourceLineIndex - startingSourceLineIndex
                };
            };

            return {
                ParseIntoStructuredData: function (segments, excludeComments) {
                    var segmentEnumerator = getSegmentEnumerator(segments),
                        objParsedData = parseIntoStructuredDataPartial(segmentEnumerator, excludeComments, [], 0, 0),
                        currentSegment,
                        intLastFragmentLineIndex;
                    while (segmentEnumerator.MoveNext()) {
                        currentSegment = segmentEnumerator.GetCurrent();
                        if ((currentSegment.CharacterCategorisation !== CssParserJs.CharacterCategorisationOptions.Comment)
                                && (currentSegment.CharacterCategorisation !== CssParserJs.CharacterCategorisationOptions.Whitespace)) {
                            if (objParsedData.Fragments.length > 0) {
                                intLastFragmentLineIndex = objParsedData.Fragments[objParsedData.Fragments.length - 1].SourceLineIndex;
                            } else {
                                intLastFragmentLineIndex = 0;
                            }
                            throw new ParseError("Encountered unexpected content - this is often caused by mismatched opening or closing braces", currentSegment.IndexInSource);
                        }
                    }
                    return objParsedData.Fragments;
                }
            };
        }());

        FragmentCategorisationOptions = {
            Comment: 0,
            Import: 1,
            MediaQuery: 2,
            Selector: 3,
            StylePropertyName: 4,
            StylePropertyValue: 5,
            GetNameFor: function (value) {
                var propertyName;
                for (propertyName in FragmentCategorisationOptions) {
                    if (FragmentCategorisationOptions.hasOwnProperty(propertyName)) {
                        if (FragmentCategorisationOptions[propertyName] === value) {
                            return propertyName;
                        }
                    }
                }
                throw new Error("Invalid FragmentCategorisationOptions: " + value);
            }
        };

        CssParserJs.ExtendedLessParser = {
            ParseIntoStructuredData: function (data, optionallyExcludeComments) {
                if (typeof (data) === "string") {
                    data = CssParserJs.ParseLess(data);
                }
                return objHierarchicalParser.ParseIntoStructuredData(data, (optionallyExcludeComments === true) ? true : false);
            },
            FragmentCategorisationOptions: FragmentCategorisationOptions
        };
    }());
    
    return CssParserJs;
});