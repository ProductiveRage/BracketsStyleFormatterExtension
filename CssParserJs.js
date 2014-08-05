/*jslint vars: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, require, module */
(this.define || function (f) { "use strict"; var n = "CssParserJs", r = f((typeof (require) === "undefined") ? function () { } : require); if ((typeof (module) !== "undefined") && module.exports) { module.exports = r; } else { this[n] = r; } }).call(this, function (require) {

    "use strict";
    
    var CharacterCategorisationOptions, ParseError, objCharacterProcessors, getCharacterPositionStringNavigator, processCharacters, groupCharacters, CssParserJs;
    
    CharacterCategorisationOptions = {
        Comment: 0,
        CloseBrace: 1,
        OpenBrace: 2,
        SemiColon: 3,
        SelectorOrStyleProperty: 4,
        StylePropertyColon: 5, // This is the colon between a Style Property and Value
        Value: 6,
        Whitespace: 7,
        GetNameFor: function (intValue) {
            var strPropertyName;
            for (strPropertyName in CharacterCategorisationOptions) {
                if (CharacterCategorisationOptions.hasOwnProperty(strPropertyName)) {
                    if (CharacterCategorisationOptions[strPropertyName] === intValue) {
                        return strPropertyName;
                    }
                }
            }
            throw new Error("Invalid CharacterCategorisationOptions: " + intValue);
        }
    };

    ParseError = function (message, indexInSource) {
        this.message = message;
        this.indexInSource = indexInSource;
    };
    ParseError.prototype = new Error();
    ParseError.prototype.constructor = ParseError;
    ParseError.prototype.name = "ParseError";
    
    objCharacterProcessors = (function () {
        var getCharacterProcessorResult,
            getSkipNextCharacterSegment,
            getSingleLineCommentSegment,
            getMultiLineCommentSegment,
            getMediaQuerySegment,
            getQuotedSegment,
            arrPseudoClasses,
            isNextWordOneOfThePseudoClasses,
            getBracketedSelectorSegment,
            getSelectorOrStyleSegment;

        getCharacterProcessorResult = function (intCharacterCategorisation, objNextProcessor) {
            return {
                CharacterCategorisation: intCharacterCategorisation,
                NextProcessor: objNextProcessor
            };
        };

        getSkipNextCharacterSegment = function (intCharacterCategorisation, objCharacterProcessorToReturnTo) {
            return {
                Process: function (objStringNavigator) {
                    return getCharacterProcessorResult(
                        intCharacterCategorisation,
                        objCharacterProcessorToReturnTo
                    );
                }
            };
        };

        getSingleLineCommentSegment = function (objCharacterProcessorToReturnTo) {
            var objProcessor = {
                Process: function (objStringNavigator) {
                    // For single line comments, the line return should be considered part of the comment content (in the same way that the "/*" and "*/" sequences
                    // are considered part of the content for multi-line comments)
                    if (objStringNavigator.DoesCurrentContentMatch("\r\n")) {
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.Comment,
                            getSkipNextCharacterSegment(
                                CharacterCategorisationOptions.Comment,
                                objCharacterProcessorToReturnTo
                            )
                        );
                    } else if ((objStringNavigator.CurrentCharacter === "\r") || (objStringNavigator.CurrentCharacter === "\n")) {
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.Comment,
                            objCharacterProcessorToReturnTo
                        );
                    }
                    return getCharacterProcessorResult(
                        CharacterCategorisationOptions.Comment,
                        objProcessor
                    );
                }
            };
            return objProcessor;
        };

        getMultiLineCommentSegment = function (objCharacterProcessorToReturnTo) {
            var objProcessor = {
                Process: function (objStringNavigator) {
                    if (objStringNavigator.DoesCurrentContentMatch("*/")) {
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.Comment,
                            getSkipNextCharacterSegment(
                                CharacterCategorisationOptions.Comment,
                                objCharacterProcessorToReturnTo
                            )
                        );
                    }
                    return getCharacterProcessorResult(
                        CharacterCategorisationOptions.Comment,
                        objProcessor
                    );
                }
            };
            return objProcessor;
        };

        getMediaQuerySegment = function (objCharacterProcessorToReturnTo) {
            var objProcessor = {
                Process: function (objStringNavigator) {
                    if (objStringNavigator.CurrentCharacter === "{") {
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.OpenBrace,
                            objCharacterProcessorToReturnTo
                        );
                    } else if (objStringNavigator.IsWhitespace) {
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.Whitespace,
                            objProcessor
                        );
                    }

                    return getCharacterProcessorResult(
                        CharacterCategorisationOptions.SelectorOrStyleProperty,
                        objProcessor
                    );
                }
            };
            return objProcessor;
        };

        getQuotedSegment = function (chrQuote, intCharacterCategorisation, objCharacterProcessorToReturnTo) {
            var objProcessor = {
                Process: function (objStringNavigator) {
                    // If the next character is a backslash then the next character should be ignored if it's "special" and just considered  to be another character
                    // in the Value string (particularly important if the next character is an escaped quote)
                    if (objStringNavigator.CurrentCharacter === "\\") {
                        return getCharacterProcessorResult(
                            intCharacterCategorisation,
                            getSkipNextCharacterSegment(
                                intCharacterCategorisation,
                                objProcessor
                            )
                        );
                    }

                    // If this is the closing quote character then include it in the Value and then return to the previous processor
                    if (objStringNavigator.CurrentCharacter === chrQuote) {
                        return getCharacterProcessorResult(
                            intCharacterCategorisation,
                            objCharacterProcessorToReturnTo
                        );
                    }

                    return getCharacterProcessorResult(
                        intCharacterCategorisation,
                        objProcessor
                    );
                }
            };
            return objProcessor;
        };

        arrPseudoClasses = [
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
            "first-letter"
        ];

        isNextWordOneOfThePseudoClasses = function (objStringNavigator) {
            // Skip over any whitespace to find the start of the next content
            while (objStringNavigator.IsWhitespace) {
                objStringNavigator = objStringNavigator.GetNext();
            }
            return arrPseudoClasses.some(function (strPseudoClass) {
                return objStringNavigator.DoesCurrentContentMatch(strPseudoClass);
            });
        };

        getBracketedSelectorSegment = function (bSupportSingleLineComments, chrCloseBracketCharacter, objProcessorToReturnTo) {
            var objOptionalCharacterCategorisationBehaviourOverride = {
                EndOfBehaviourOverrideCharacter: chrCloseBracketCharacter,
                CharacterCategorisation: CharacterCategorisationOptions.SelectorOrStyleProperty,
                CharacterProcessorToReturnTo: objProcessorToReturnTo
            };
            return getSelectorOrStyleSegment(false, bSupportSingleLineComments, objOptionalCharacterCategorisationBehaviourOverride);
        };

        getSelectorOrStyleSegment = function (bProcessAsValueContent, bSupportSingleLineComments, objOptionalCharacterCategorisationBehaviourOverride) {
            var objProcessor;
            function getSelectorOrStyleCharacterProcessor() {
                if (!bProcessAsValueContent) {
                    return objProcessor;
                }
                return getSelectorOrStyleSegment(false, bSupportSingleLineComments, null);
            }
            function getValueCharacterProcessor() {
                if (bProcessAsValueContent) {
                    return objProcessor;
                }
                return getSelectorOrStyleSegment(true, bSupportSingleLineComments, null);
            }
            objProcessor = {
                Process: function (objStringNavigator) {
                    var chrNextCharacter, chrClosingBracket;

                    // Is this the end of the section that the optionalCharacterCategorisationBehaviourOverride (if non-null) is concerned with? If so then drop back
                    // out to the character processor that handed control over to the optionalCharacterCategorisationBehaviourOverride.
                    if (objOptionalCharacterCategorisationBehaviourOverride
                            && (objStringNavigator.CurrentCharacter === objOptionalCharacterCategorisationBehaviourOverride.EndOfBehaviourOverrideCharacter)) {
                        return getCharacterProcessorResult(
                            objOptionalCharacterCategorisationBehaviourOverride.CharacterCategorisation,
                            objOptionalCharacterCategorisationBehaviourOverride.CharacterProcessorToReturnTo
                        );
                    }

                    // Deal with other special characters (bearing in mind the altered interactions if optionalCharacterCategorisationBehaviourOverride is non-null)
                    if (objStringNavigator.CurrentCharacter === "{") {
                        if (objOptionalCharacterCategorisationBehaviourOverride) {
                            return getCharacterProcessorResult(
                                objOptionalCharacterCategorisationBehaviourOverride.CharacterCategorisation,
                                objProcessor
                            );
                        }
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.OpenBrace,
                            getSelectorOrStyleCharacterProcessor()
                        );
                    } else if (objStringNavigator.CurrentCharacter === "}") {
                        if (objOptionalCharacterCategorisationBehaviourOverride) {
                            return getCharacterProcessorResult(
                                objOptionalCharacterCategorisationBehaviourOverride.CharacterCategorisation,
                                objProcessor
                            );
                        }
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.CloseBrace,
                            getSelectorOrStyleCharacterProcessor()
                        );
                    } else if (objStringNavigator.CurrentCharacter === ";") {
                        if (objOptionalCharacterCategorisationBehaviourOverride) {
                            return getCharacterProcessorResult(
                                objOptionalCharacterCategorisationBehaviourOverride.CharacterCategorisation,
                                objProcessor
                            );
                        }
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.SemiColon,
                            getSelectorOrStyleCharacterProcessor()
                        );
                    } else if (objStringNavigator.CurrentCharacter === ":") {
                        if (objOptionalCharacterCategorisationBehaviourOverride) {
                            return getCharacterProcessorResult(
                                objOptionalCharacterCategorisationBehaviourOverride.CharacterCategorisation,
                                objProcessor
                            );
                        }

                        // If the colon indicates a pseudo-class for a selector then we want to continue processing it as a selector and not presume that the content
                        // type has switched to a value (this is more complicated with LESS nesting to support, if it was just CSS  then things would have been easier!)
                        if (!bProcessAsValueContent && isNextWordOneOfThePseudoClasses(objStringNavigator.GetNext())) {
                            return getCharacterProcessorResult(
                                CharacterCategorisationOptions.SelectorOrStyleProperty,
                                getSelectorOrStyleCharacterProcessor()
                            );
                        }
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.StylePropertyColon,
                            getValueCharacterProcessor()
                        );
                    } else if (objStringNavigator.IsWhitespace) {
                        if (objOptionalCharacterCategorisationBehaviourOverride) {
                            return getCharacterProcessorResult(
                                objOptionalCharacterCategorisationBehaviourOverride.CharacterCategorisation,
                                objProcessor
                            );
                        }
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.Whitespace,
                            objProcessor
                        );
                    }

                    // To deal with comments we use specialised comment-handling processors (even if an objOptionalCharacterCategorisationBehaviourOverride is
                    // specified we still treat deal with comments as normal, their content is not forced into a different categorisation)
                    if (objStringNavigator.CurrentCharacter === "/") {
                        chrNextCharacter = objStringNavigator.GetNext().CurrentCharacter;
                        if (bSupportSingleLineComments && (chrNextCharacter === "/")) {
                            return getCharacterProcessorResult(
                                CharacterCategorisationOptions.Comment,
                                getSingleLineCommentSegment(objProcessor)
                            );
                        } else if (chrNextCharacter === "*") {
                            return getCharacterProcessorResult(
                                CharacterCategorisationOptions.Comment,
                                getMultiLineCommentSegment(objProcessor)
                            );
                        }
                    }

                    // Although media query declarations will be marked as SelectorOrStyleProperty content, special handling is required to ensure that any colons
                    // that exist in it are identified as part of the SelectorOrStyleProperty and not marked as a StylePropertyColon
                    if (!bProcessAsValueContent && objStringNavigator.DoesCurrentContentMatch("@media")) {
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.SelectorOrStyleProperty,
                            getMediaQuerySegment(objProcessor)
                        );
                    }

                    if ((objStringNavigator.CurrentCharacter === "\"") || (objStringNavigator.CurrentCharacter === "'")) {
                        // If an objOptionalCharacterCategorisationBehaviourOverride was specified then the content will be identified as whatever categorisation
                        // is specified by it, otherwise it will be identified as being CharacterCategorisationOptions.Value
                        if (objOptionalCharacterCategorisationBehaviourOverride) {
                            return getCharacterProcessorResult(
                                objOptionalCharacterCategorisationBehaviourOverride.CharacterCategorisation,
                                getQuotedSegment(
                                    objStringNavigator.CurrentCharacter,
                                    objOptionalCharacterCategorisationBehaviourOverride.CharacterCategorisation,
                                    objProcessor
                                )
                            );
                        }
                        return getCharacterProcessorResult(
                            CharacterCategorisationOptions.Value,
                            getQuotedSegment(
                                objStringNavigator.CurrentCharacter,
                                CharacterCategorisationOptions.Value,
                                getValueCharacterProcessor()
                            )
                        );
                    }

                    // If we're currently processing StyleOrSelector content and we encounter a square or round open bracket then we're about to enter an attribute
                    // selector (eg. "a[href]") or a LESS mixin argument set (eg. ".RoundedCorners (@radius"). In either case we need to consider all content until
                    // the corresponding close bracket to be a StyleOrSelector, whether it's whitespace or a quoted section (note: not if it's a comment, that still
                    // gets identified as comment content).
                    if (!bProcessAsValueContent) {
                        if (objStringNavigator.CurrentCharacter === "[") {
                            chrClosingBracket = "]";
                        } else if (objStringNavigator.CurrentCharacter === "(") {
                            chrClosingBracket = ")";
                        } else {
                            chrClosingBracket = null;
                        }
                        if (chrClosingBracket) {
                            return getCharacterProcessorResult(
                                CharacterCategorisationOptions.SelectorOrStyleProperty,
                                getBracketedSelectorSegment(
                                    bSupportSingleLineComments,
                                    chrClosingBracket,
                                    objProcessor
                                )
                            );
                        }
                    }

                    // If it's not a quoted or bracketed section, then we can continue to use this instance to process the content
                    return getCharacterProcessorResult(
                        bProcessAsValueContent ? CharacterCategorisationOptions.Value : CharacterCategorisationOptions.SelectorOrStyleProperty,
                        objProcessor
                    );
                }
            };
            return objProcessor;
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
    
    getCharacterPositionStringNavigator = function (strValue, intIndex) {
        var
            bPastEndOfContent = (intIndex >= strValue.length),
            objStringNavigator = {
                CurrentCharacter: bPastEndOfContent ? null : strValue.charAt(intIndex),
                IsWhitespace: bPastEndOfContent ? false : /\s/.test(strValue.charAt(intIndex)),
                DoesCurrentContentMatch: function (strCheckFor) {
                    if (!strCheckFor) {
                        return false;
                    }
                    return strValue.substr(intIndex, strCheckFor.length) === strCheckFor;
                }
            };
        if (bPastEndOfContent) {
            objStringNavigator.GetNext = function () {
                return objStringNavigator;
            };
        } else {
            objStringNavigator.GetNext = function () {
                return getCharacterPositionStringNavigator(strValue, intIndex + 1);
            };
        }
        return objStringNavigator;
    };
    
    processCharacters = function (objProcessor, strValue) {
        var objCharacterResult,
            arrAllCharacterResults = [],
            objStringNavigator = getCharacterPositionStringNavigator(strValue, 0);
        while (objStringNavigator.CurrentCharacter) {
            objCharacterResult = objProcessor.Process(objStringNavigator);
            arrAllCharacterResults.push({
                Character: objStringNavigator.CurrentCharacter,
                CharacterCategorisation: objCharacterResult.CharacterCategorisation
            });
            objStringNavigator = objStringNavigator.GetNext();
            objProcessor = objCharacterResult.NextProcessor;
        }
        return arrAllCharacterResults;
    };
    
    groupCharacters = function (arrCategorisedCharacters) {
        var arrStrings = [],
            objCharacterBuffer = {
                CharacterCategorisation: null,
                Characters: [],
                IndexInSource: null
            };
        
        arrCategorisedCharacters.forEach(function (objCategorisedCharacter, intIndex) {
            var bCharacterShouldNotBeGrouped = (
                (objCategorisedCharacter.CharacterCategorisation === CharacterCategorisationOptions.CloseBrace) ||
                (objCategorisedCharacter.CharacterCategorisation === CharacterCategorisationOptions.OpenBrace) ||
                (objCategorisedCharacter.CharacterCategorisation === CharacterCategorisationOptions.SemiColon)
            );
            if ((objCategorisedCharacter.CharacterCategorisation === objCharacterBuffer.CharacterCategorisation) && !bCharacterShouldNotBeGrouped) {
                objCharacterBuffer.Characters.push(objCategorisedCharacter.Character);
                return;
            }
            
            if (objCharacterBuffer.Characters.length > 0) {
                arrStrings.push({
                    CharacterCategorisation: objCharacterBuffer.CharacterCategorisation,
                    Value: objCharacterBuffer.Characters.join(""),
                    IndexInSource: objCharacterBuffer.IndexInSource
                });
            }
            
            if (bCharacterShouldNotBeGrouped) {
                arrStrings.push({
                    CharacterCategorisation: objCategorisedCharacter.CharacterCategorisation,
                    Value: objCategorisedCharacter.Character,
                    IndexInSource: intIndex
                });
                objCharacterBuffer = {
                    CharacterCategorisation: null,
                    Characters: [],
                    IndexInSource: null
                };
            } else {
                objCharacterBuffer = {
                    CharacterCategorisation: objCategorisedCharacter.CharacterCategorisation,
                    Characters: [ objCategorisedCharacter.Character ],
                    IndexInSource: intIndex
                };
            }
        });
        
        if (objCharacterBuffer.Characters.length > 0) {
            arrStrings.push({
                CharacterCategorisation: objCharacterBuffer.CharacterCategorisation,
                Value: objCharacterBuffer.Characters.join(""),
                IndexInSource: objCharacterBuffer.IndexInSource
            });
        }
        
        return arrStrings;
    };
    
    CssParserJs = {
        CharacterCategorisationOptions: CharacterCategorisationOptions,
        ParseError: ParseError,
        ParseCss: function (strValue) {
            return groupCharacters(processCharacters(objCharacterProcessors.GetNewCssProcessor(), strValue));
        },
        ParseLess: function (strValue) {
            return groupCharacters(processCharacters(objCharacterProcessors.GetNewLessProcessor(), strValue));
        }
    };

    // Now that the CssParserJs reference has been prepared, with the basic character categorisation, the next layer is added to the API, where
    // content is parsed into a hierarchical structure
    (function () {
        var objSelectorBreaker,
            objHierarchicalParser,
            FragmentCategorisationOptions;

        objSelectorBreaker = (function () {
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

            getSelectorProcessorResult = function (intCharacterCategorisation, objNextProcessor) {
                return {
                    CharacterCategorisation: intCharacterCategorisation,
                    NextProcessor: objNextProcessor
                };
            };

            getDefaultSelectorProcessor = function () {
                var objProcessor = {
                    Process: function (chrCurrent) {
                        if (/\s/.test(chrCurrent)) {
                            return getSelectorProcessorResult(CharacterCategorisationOptions.EndOfSelectorSegment, objProcessor);
                        } else if (chrCurrent === ",") {
                            return getSelectorProcessorResult(CharacterCategorisationOptions.EndOfSelector, objProcessor);
                        } else if (chrCurrent === "[") {
                            return getSelectorProcessorResult(CharacterCategorisationOptions.SelectorSegment, getAttributeSelectorProcessor(objProcessor));
                        } else {
                            return getSelectorProcessorResult(CharacterCategorisationOptions.SelectorSegment, objProcessor);
                        }
                    }
                };
                return objProcessor;
            };

            getAttributeSelectorProcessor = function (objProcessorToReturnTo) {
                var objProcessor = {
                    Process: function (chrCurrent) {
                        if ((chrCurrent === "\"") || (chrCurrent === "'")) {
                            return getSelectorProcessorResult(CharacterCategorisationOptions.SelectorSegment, getQuotedSelectorProcessor(objProcessor, chrCurrent, false));
                        } else if (chrCurrent === "]") {
                            return getSelectorProcessorResult(CharacterCategorisationOptions.SelectorSegment, objProcessorToReturnTo);
                        } else {
                            return getSelectorProcessorResult(CharacterCategorisationOptions.SelectorSegment, objProcessor);
                        }
                    }
                };
                return objProcessor;
            };

            getQuotedSelectorProcessor = function (objProcessorToReturnTo, chrQuoteCharacter, bNextCharacterIsEscaped) {
                var objProcessor = {
                    Process: function (chrCurrent) {
                        if (bNextCharacterIsEscaped) {
                            return getSelectorProcessorResult(CharacterCategorisationOptions.SelectorSegment, getQuotedSelectorProcessor(objProcessor, chrCurrent, false));
                        } else if (chrCurrent === chrQuoteCharacter) {
                            return getSelectorProcessorResult(CharacterCategorisationOptions.SelectorSegment, objProcessorToReturnTo);
                        } else {
                            return getSelectorProcessorResult(CharacterCategorisationOptions.SelectorSegment, objProcessor);
                        }
                    }
                };
                return objProcessor;
            };

            return {
                Break: function (strSelector) {
                    var arrSelectors = [],
                        arrSelectorBuffer = [],
                        arrSelectorSegmentBuffer = [],
                        objProcessor = getDefaultSelectorProcessor(),
                        objSelectorProcessorResult;

                    // Include an extra character on the end so that there's an extra pass through the loop where the EndOfSelector categorisation is specified (and the
                    // extra character ignored)
                    strSelector.split("").concat([" "]).forEach(function (chrCurrent, intIndex) {
                        if (intIndex === strSelector.length) {
                            objSelectorProcessorResult = getSelectorProcessorResult(CharacterCategorisationOptions.EndOfSelector, objProcessor);
                        } else {
                            objSelectorProcessorResult = objProcessor.Process(chrCurrent);
                        }
                        if (objSelectorProcessorResult.CharacterCategorisation === CharacterCategorisationOptions.SelectorSegment) {
                            arrSelectorSegmentBuffer.push(chrCurrent);
                        } else if (objSelectorProcessorResult.CharacterCategorisation === CharacterCategorisationOptions.EndOfSelectorSegment) {
                            if (arrSelectorSegmentBuffer.length > 0) {
                                arrSelectorBuffer.push(arrSelectorSegmentBuffer.join(""));
                                arrSelectorSegmentBuffer = [];
                            }
                        } else if (objSelectorProcessorResult.CharacterCategorisation === CharacterCategorisationOptions.EndOfSelector) {
                            if (arrSelectorSegmentBuffer.length > 0) {
                                arrSelectorBuffer.push(arrSelectorSegmentBuffer.join(""));
                                arrSelectorSegmentBuffer = [];
                            }
                            if (arrSelectorBuffer.length > 0) {
                                arrSelectors.push(arrSelectorBuffer);
                                arrSelectorBuffer = [];
                            }
                        } else {
                            throw new ParseError("Unsupported CharacterCategorisationOptions: " + objSelectorProcessorResult.CharacterCategorisation, intIndex);
                        }

                        objProcessor = objSelectorProcessorResult.NextProcessor;
                    });
                    return arrSelectors;
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

            getSegmentEnumerator = function (arrSegments) {
                var intIndex = -1;
                return {
                    GetCurrent: function () {
                        return ((intIndex < 0) || (intIndex >= arrSegments.length)) ? null : arrSegments[intIndex];
                    },
                    MoveNext: function () {
                        if (intIndex < arrSegments.length) {
                            intIndex = intIndex + 1;
                        }
                        return (intIndex < arrSegments.length);
                    },
                    TryToPeekAhead: function (positiveOffsetToPeekFor) {
                        var peekIndex = intIndex + positiveOffsetToPeekFor;
                        if (peekIndex >= arrSegments.length) {
                            return {
                                Success: false
                            };
                        }
                        return {
                            Success: true,
                            Value: arrSegments[peekIndex]
                        };
                    }
                };
            };

            getPropertyValueBuffer = function () {
                var objStylePropertyValue = null;
                return {
                    Add: function (objLastStylePropertyName, strPropertyValueSegment, intSourceLineIndex) {
                        if (objStylePropertyValue) {
                            objStylePropertyValue.Values.push(strPropertyValueSegment);
                        } else {
                            objStylePropertyValue = {
                                FragmentCategorisation: FragmentCategorisationOptions.StylePropertyValue,
                                Property: objLastStylePropertyName,
                                Values: [strPropertyValueSegment],
                                SourceLineIndex: intSourceLineIndex
                            };
                        }
                    },
                    GetHasContent: function () {
                        return !!objStylePropertyValue;
                    },
                    ExtractCombinedContentAndClear: function () {
                        if (!objStylePropertyValue) {
                            throw new Error("No content to retrieve");
                        }
                        var objValueToReturn = objStylePropertyValue;
                        objStylePropertyValue = null;
                        return objValueToReturn;
                    }
                };
            };

            getSelectorSet = function (strSelectors) {
                // Using the SelectorBreaker means that any quoting, square brackets or other escaping is taken into account
                var arrSelectors = objSelectorBreaker.Break(strSelectors),
                    arrTidiedSelectors = [];
                arrSelectors.forEach(function (arrSelectorSegments) {
                    arrTidiedSelectors.push(arrSelectorSegments.join(" "));
                });
                return arrTidiedSelectors;
            };

            trim = function (strValue) {
                return strValue.trim ? strValue.trim() : strValue.replace(/^\s+|\s+$/g, "");
            };

            getNumberOfLineReturnsFromContentIfAny = function (strValue) {
                if ((strValue.indexOf("\r") === -1) && (strValue.indexOf("\n") === -1)) {
                    return 0;
                }
                return strValue.match(/\r\n|\r|\n/g).length;
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

            parseIntoStructuredDataPartial = function (objSegmentEnumerator, bExcludeComments, arrParentSelectorSets, intDepth, intSourceLineIndex) {
                var intStartingSourceLineIndex = intSourceLineIndex,
                    arrFragments = [],
                    arrSelectorOrStyleContentBuffer = [],
                    intSelectorOrStyleStartSourceLineIndex = -1,
                    objLastStylePropertyName = null,
                    objStylePropertyValueBuffer = getPropertyValueBuffer(),
                    objSegment,
                    arrSelectors,
                    objParsedNestedData,
                    strSelectorOrStyleContent;

                while (objSegmentEnumerator.MoveNext()) {
                    objSegment = objSegmentEnumerator.GetCurrent();
                    switch (objSegment.CharacterCategorisation) {

                    case CssParserJs.CharacterCategorisationOptions.Comment:
                        if (!bExcludeComments) {
                            if (isCommentWithinStylePropertyValue(arrFragments.length > 0 ? arrFragments[arrFragments.length - 1] : null, objSegmentEnumerator)) {
                                // If this comment is a commented-out section of a property value (eg. "color: /*red*/ value;") then, in order to accurately represent
                                // the input in the model that we have (that groups style property values together into a single fragment, along with a reference to
                                // the style property name), the comment has to be considered part of the style property value. If this behaviour is not desired
                                // (if, for example, this parsing step is used to minify content) then the argument may be set that excludes comments.
                                objStylePropertyValueBuffer.Add(objLastStylePropertyName, forceIntoMultiLineComment(objSegment.Value), intSelectorOrStyleStartSourceLineIndex);
                            } else {
                                if (objStylePropertyValueBuffer.GetHasContent()) {
                                    arrFragments.push(objStylePropertyValueBuffer.ExtractCombinedContentAndClear());
                                }
                                arrFragments.push({
                                    FragmentCategorisation: FragmentCategorisationOptions.Comment,
                                    Value: objSegment.Value,
                                    SourceLineIndex: intSourceLineIndex
                                });
                            }
                        }
                        intSourceLineIndex += getNumberOfLineReturnsFromContentIfAny(objSegment.Value);
                        break;

                    case CssParserJs.CharacterCategorisationOptions.Whitespace:
                        if (arrSelectorOrStyleContentBuffer.length > 0) {
                            arrSelectorOrStyleContentBuffer.push(" ");
                        }
                        intSourceLineIndex += getNumberOfLineReturnsFromContentIfAny(objSegment.Value);
                        break;

                    case CssParserJs.CharacterCategorisationOptions.SelectorOrStyleProperty:
                        if (arrSelectorOrStyleContentBuffer.length === 0) {
                            intSelectorOrStyleStartSourceLineIndex = intSourceLineIndex;
                        }
                        arrSelectorOrStyleContentBuffer.push(objSegment.Value);

                        // If we were building up content for a StylePropertyValue then encountering other content means that the value must have terminated (for valid
                        // CSS it should be only a semicolon or close brace that terminates a value but we're not concerned about invalid CSS here)
                        if (objStylePropertyValueBuffer.GetHasContent()) {
                            arrFragments.push(objStylePropertyValueBuffer.ExtractCombinedContentAndClear());
                        }
                        break;

                    case CssParserJs.CharacterCategorisationOptions.OpenBrace:
                        if (arrSelectorOrStyleContentBuffer.length === 0) {
                            throw new ParseError("Encountered OpenBrace with no preceding selector", objSegment.IndexInSource);
                        }

                        // If we were building up content for a StylePropertyValue then encountering other content means that the value must have terminated (for valid
                        // CSS it should be only a semicolon or close brace that terminates a value but we're not concerned about invalid CSS here)
                        if (objStylePropertyValueBuffer.GetHasContent()) {
                            arrFragments.push(objStylePropertyValueBuffer.ExtractCombinedContentAndClear());
                        }

                        arrSelectors = getSelectorSet(arrSelectorOrStyleContentBuffer.join(""));
                        if (arrSelectors.length === 0) {
                            throw new ParseError("Open brace encountered with no leading selector content", objSegment.IndexInSource);
                        }
                        objParsedNestedData = parseIntoStructuredDataPartial(
                            objSegmentEnumerator,
                            bExcludeComments,
                            arrParentSelectorSets.concat([arrSelectors]),
                            intDepth + 1,
                            intSourceLineIndex
                        );
                        arrFragments.push({
                            FragmentCategorisation: (arrSelectors[0].toLowerCase().substring(0, 6) === "@media")
                                ? FragmentCategorisationOptions.MediaQuery
                                : FragmentCategorisationOptions.Selector,
                            ParentSelectors: arrParentSelectorSets,
                            Selectors: arrSelectors,
                            ChildFragments: objParsedNestedData.Fragments,
                            SourceLineIndex: intSelectorOrStyleStartSourceLineIndex
                        });
                        intSourceLineIndex += objParsedNestedData.NumberOfLinesParsed;
                        arrSelectorOrStyleContentBuffer = [];
                        break;

                    case CssParserJs.CharacterCategorisationOptions.CloseBrace:
                        if (intDepth === 0) {
                            throw new ParseError("Encountered unexpected close brace", objSegment.IndexInSource);
                        }
                            
                        // If we were building up content for a StylePropertyValue then encountering other content means that the value must have terminated (for valid
                        // CSS it should be only a semicolon or close brace that terminates a value but we're not concerned about invalid CSS here)
                        if (objStylePropertyValueBuffer.GetHasContent()) {
                            arrFragments.push(objStylePropertyValueBuffer.ExtractCombinedContentAndClear());
                        }

                        if (arrSelectorOrStyleContentBuffer.length > 0) {
                            arrFragments.push({
                                FragmentCategorisation: FragmentCategorisationOptions.StylePropertyName,
                                Value: arrSelectorOrStyleContentBuffer.join(""),
                                SourceLineIndex: intSelectorOrStyleStartSourceLineIndex
                            });
                        }
                        return {
                            Fragments: arrFragments,
                            NumberOfLinesParsed: intSourceLineIndex - intStartingSourceLineIndex
                        };

                    case CssParserJs.CharacterCategorisationOptions.StylePropertyColon:
                    case CssParserJs.CharacterCategorisationOptions.SemiColon:
                        // If we were building up content for a StylePropertyValue then encountering other content means that the value must have terminated (for valid
                        // CSS it should be only a semicolon or close brace that terminates a value but we're not concerned about invalid CSS here)
                        if (objStylePropertyValueBuffer.GetHasContent()) {
                            arrFragments.push(objStylePropertyValueBuffer.ExtractCombinedContentAndClear());
                        }

                        if (arrSelectorOrStyleContentBuffer.length > 0) {
                            strSelectorOrStyleContent = arrSelectorOrStyleContentBuffer.join("");
                            if (strSelectorOrStyleContent.toLowerCase().substring(0, 7) === "@import") {
                                arrFragments.push({
                                    FragmentCategorisation: FragmentCategorisationOptions.Import,
                                    Value: trim(strSelectorOrStyleContent.substring(7)),
                                    SourceLineIndex: intSourceLineIndex
                                });
                                arrSelectorOrStyleContentBuffer = [];
                                break;
                            }

                            // Note: The SemiColon case here probably suggests invalid content, it should only follow a Value segment (ignoring  Comments and WhiteSpace),
                            // so if there is anything in the selectorOrStyleContentBuffer before the SemiColon then it's probably not correct (but we're not validating
                            // for that here, we just don't want to throw anything away!)
                            objLastStylePropertyName = {
                                FragmentCategorisation: FragmentCategorisationOptions.StylePropertyName,
                                Value: arrSelectorOrStyleContentBuffer.join(""),
                                SourceLineIndex: intSelectorOrStyleStartSourceLineIndex
                            };
                            arrFragments.push(objLastStylePropertyName);
                            arrSelectorOrStyleContentBuffer = [];
                        }
                        break;

                    case CssParserJs.CharacterCategorisationOptions.Value:
                        if (arrSelectorOrStyleContentBuffer.length > 0) {
                            strSelectorOrStyleContent = arrSelectorOrStyleContentBuffer.join("");
                            if (strSelectorOrStyleContent.toLowerCase().substring(0, 7) === "@import") {
                                arrSelectorOrStyleContentBuffer.push(objSegment.Value);
                                break;
                            }

                            // This is presumably an error condition, there should be a colon between SelectorOrStyleProperty content and Value content, but we're not
                            // validating here so just lump it all together
                            objLastStylePropertyName = {
                                FragmentCategorisation: FragmentCategorisationOptions.StylePropertyName,
                                Value: arrSelectorOrStyleContentBuffer.join(""),
                                SourceLineIndex: intSelectorOrStyleStartSourceLineIndex
                            };
                            arrFragments.push(objLastStylePropertyName);
                            arrSelectorOrStyleContentBuffer = [];
                        }
                        if (!objLastStylePropertyName) {
                            throw new ParseError("Invalid content, orphan style property value encountered", objSegment.IndexInSource);
                        }
                        objStylePropertyValueBuffer.Add(objLastStylePropertyName, objSegment.Value, intSelectorOrStyleStartSourceLineIndex);
                        break;

                    default:
                        throw new ParseError("Unsupported CharacterCategorisationOptions value: " + objSegment.CharacterCategorisation, objSegment.IndexInSource);
                    }
                }

                // If we have any content in the selectorOrStyleContentBuffer and we're hitting a CloseBrace then it's probably invalid content but just stash it away
                // and move on! (The purpose of this work isn't to get too nuts about invalid CSS).
                if (arrSelectorOrStyleContentBuffer.length > 0) {
                    arrSelectors = getSelectorSet(arrSelectorOrStyleContentBuffer.join(""));
                    arrFragments.push({
                        FragmentCategorisation: (arrSelectors[0].Value.toLowerCase().substring(0, 6) === "@media")
                            ? FragmentCategorisationOptions.MediaQuery
                            : FragmentCategorisationOptions.Selector,
                        ParentSelectors: arrParentSelectorSets,
                        Selectors: arrSelectors,
                        ChildFragments: [],
                        SourceLineIndex: intSourceLineIndex
                    });
                }

                // It's very feasible that there will still be some style property value content in the buffer at this point, so ensure it doesn't get lost
                if (objStylePropertyValueBuffer.GetHasContent()) {
                    arrFragments.push(objStylePropertyValueBuffer.ExtractCombinedContentAndClear());
                }

                return {
                    Fragments: arrFragments,
                    NumberOfLinesParsed: intSourceLineIndex - intStartingSourceLineIndex
                };
            };

            return {
                ParseIntoStructuredData: function (arrSegments, bExcludeComments) {
                    var objSegmentEnumerator = getSegmentEnumerator(arrSegments),
                        objParsedData = parseIntoStructuredDataPartial(objSegmentEnumerator, bExcludeComments, [], 0, 0),
                        objSegment,
                        intLastFragmentLineIndex;
                    while (objSegmentEnumerator.MoveNext()) {
                        objSegment = objSegmentEnumerator.GetCurrent();
                        if ((objSegment.CharacterCategorisation !== CssParserJs.CharacterCategorisationOptions.Comment)
                                && (objSegment.CharacterCategorisation !== CssParserJs.CharacterCategorisationOptions.Whitespace)) {
                            if (objParsedData.Fragments.length > 0) {
                                intLastFragmentLineIndex = objParsedData.Fragments[objParsedData.Fragments.length - 1].SourceLineIndex;
                            } else {
                                intLastFragmentLineIndex = 0;
                            }
                            throw new ParseError("Encountered unexpected content - this is often caused by mismatched opening or closing braces", objSegment.IndexInSource);
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
            GetNameFor: function (intValue) {
                var strPropertyName;
                for (strPropertyName in FragmentCategorisationOptions) {
                    if (FragmentCategorisationOptions.hasOwnProperty(strPropertyName)) {
                        if (FragmentCategorisationOptions[strPropertyName] === intValue) {
                            return strPropertyName;
                        }
                    }
                }
                throw new Error("Invalid FragmentCategorisationOptions: " + intValue);
            }
        };

        CssParserJs.ExtendedLessParser = {
            ParseIntoStructuredData: function (data, bOptionallyExcludeComments) {
                if (typeof (data) === "string") {
                    data = CssParserJs.ParseLess(data);
                }
                return objHierarchicalParser.ParseIntoStructuredData(data, (bOptionallyExcludeComments === true) ? true : false);
            },
            FragmentCategorisationOptions: FragmentCategorisationOptions
        };
    }());
    
    return CssParserJs;
});