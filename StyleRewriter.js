/*jslint vars: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, require, module */
(this.define || function (f) { "use strict"; var n = "StyleRewriter", r = f((typeof (require) === "undefined") ? function (a) { return ((typeof (window) === "undefined") ? {} : window)[a]; } : require); if ((typeof (module) !== "undefined") && module.exports) { module.exports = r; } else { this[n] = r; } }).call(this, function (require) {

    "use strict";
    
    var breakComments,
        rewrite,
        getSingleFragmentContent,
        flattenAnyApplicableSelectors,
        getNumberOfLineReturnsBefore,
        getNumberOfLineReturnsAfter,
        isComment,
        isImport,
        isSelector,
        isMediaQuery,
        isStylePropertyName,
        isStylePropertyValue,
        isSinglePropertyContainer,
        getIndentation,
        repeatString,
        trim,
        CssParserJs = require("CssParserJs");
    
    breakComments = function (fragments) {
        // Comments may be combined here since they would have been seen as continuous strings of comment characters by the parser, but the rendering here relies upon them
        // being split up. So "// Comment1\n//Comment2\n" should be split into "// Comment1\n" and "// Comment2\n". Note that the line return is part of the comment in a
        // single line comment, since it represents the termination character of the comment (the termination of a multi-line comment is "*/" and any subsequent line
        // return will have been identified as white space and not an inherent part of the comment). The logic behind this is that the parser identifies white space
        // as content that could be removed and not affect the semantic meaning of the content.
        var fragmentsWithIndividualCommentsSeparated = [],
            trim = function (strValue) {
                return strValue.trim ? strValue.trim() : strValue.replace(/^\s+|\s+$/g, "");
            };
        fragments.forEach(function (fragment) {
            if (!isComment(fragment)) {
                fragmentsWithIndividualCommentsSeparated.push(fragment);
                return;
            }
            
            var commentContent = fragment.Value;
            var sourceLineIndex = fragment.SourceLineIndex;
            while (commentContent) {
                var termination;
                if (commentContent.substr(0, 2) === "//") {
                    termination = "\n"; // This only works since we standardised line returns at the public "Rewrite" entry point
                } else if (commentContent.substr(0, 2) === "/*") {
                    termination = "*/";
                } else {
                    throw new Error("Invalid comment content in comment at line " + (sourceLineIndex + 1));
                }

                var endOfSingleCommentContent = commentContent.indexOf(termination);
                var singleCommentContent;
                if (endOfSingleCommentContent === -1) {
                    singleCommentContent = commentContent;
                } else {
                    singleCommentContent = commentContent.substr(0, endOfSingleCommentContent + termination.length);
                }
                fragmentsWithIndividualCommentsSeparated.push({
                    FragmentCategorisation: fragment.FragmentCategorisation,
                    Value: trim(singleCommentContent),
                    SourceLineIndex: sourceLineIndex
                });
                commentContent = commentContent.substr(singleCommentContent.length);
                sourceLineIndex += singleCommentContent.split("\n").length; // This only works since we standardised line returns at the public "Rewrite" entry point
            }
        });
        return fragmentsWithIndividualCommentsSeparated;
    };
    
    rewrite = function (fragments, indentationDepth, warningLogger) {
        var contentBuilder = [],
            lastFragmentWroteLineReturn = false;
        
        fragments = breakComments(fragments);
        fragments.forEach(function (fragment, index) {
            var previousFragments = fragments.slice(0).splice(0, index), // slice(0) is a way to clone array, splice(0, x) then takes the first x elements from the clone..
                nextFragments = fragments.slice(0).splice(index + 1), // .. while splice(x + 1) takes the elements AFTER the first (x + 1)
                lineReturnIndex;

            var numberOfLineReturnsBeforeFragment = getNumberOfLineReturnsBefore(fragment, previousFragments, nextFragments, (indentationDepth === 0));
            if (numberOfLineReturnsBeforeFragment > 0) {
                contentBuilder.push(repeatString(numberOfLineReturnsBeforeFragment, "\n"));
                lastFragmentWroteLineReturn = true;
            }

            if (lastFragmentWroteLineReturn) {
                contentBuilder.push(getIndentation(indentationDepth));
            }

            contentBuilder.push(
                getSingleFragmentContent(fragment, previousFragments, nextFragments, lastFragmentWroteLineReturn, indentationDepth, warningLogger)
            );

            var numberOfLineReturnsAfterFragment = getNumberOfLineReturnsAfter(fragment, previousFragments, nextFragments);
            contentBuilder.push(repeatString(numberOfLineReturnsAfterFragment, "\n"));
            lastFragmentWroteLineReturn = (numberOfLineReturnsAfterFragment > 0);
        });
        return contentBuilder.join("");
    };
    
    getSingleFragmentContent = function (fragment, previousFragments, nextFragments, lastFragmentWroteLineReturn, indentationDepth, warningLogger) {
        if (isImport(fragment)) {
            return "@import " + fragment.Value + ";";
        }

        if (isMediaQuery(fragment) || isSelector(fragment)) {
            if (fragment.ChildFragments.length === 0) {
                throw new Error("Encountered fragment which is a Selector with no ChildFragments - these should have been removed before calling this method");
            }

            var selectorsContent = fragment.Selectors.join(", ");

            var mediaQueryContentBuilder = [];
            mediaQueryContentBuilder.push(selectorsContent);
            if (isSinglePropertyContainer(fragment)) {
                // If there's only a single property in the container content (and nothing else) then render it on a single line
                // - This relies upon standardisation of line returns at the public "Rewrite" entry point
                var singlePropertyAssignment = rewrite(fragment.ChildFragments, indentationDepth + 1, warningLogger);
                mediaQueryContentBuilder.push(" { ");
                mediaQueryContentBuilder.push(trim(singlePropertyAssignment.replace(/\n/g, " ")));
                mediaQueryContentBuilder.push(" }");
            } else {
                // Note: There is no line return after the opening brace in case the first fragment is a same-line comment. In
                // order to support this, this method has to be aware that line returns may need inserting at the start or end
                // of sections so that this scenario can be handled correctly.
                mediaQueryContentBuilder.push(" {");
                mediaQueryContentBuilder.push(rewrite(fragment.ChildFragments, indentationDepth + 1, warningLogger));
                mediaQueryContentBuilder.push(getIndentation(indentationDepth));
                mediaQueryContentBuilder.push("}");
            }
            return mediaQueryContentBuilder.join("");
        }

        if (isStylePropertyName(fragment)) {
            // A StylePropertyName could actually be a Mixin (this could be handled better by the CSS Parser!) so we'll need
            // to try to work out if this is the case or not. It should be simple enough.. if the next non-ignorable (ie.
            // comment) fragment is a StylePropertyValue then this must have been the property name associated with that
            // value. If the next non-ignorable fragment is anything else (such as another StylePropertyName or a
            // Selector or a Media Query) then this StylePropertyName does not have an associated StylePropertyValue
            // and so presumably is a Mixin.
            var confirmedToBePropertyName;
            nextFragments.some(function (laterFragment) {
                if (isComment(laterFragment)) {
                    return false; // Ignore comments, they make no difference one way or the other
                }
                confirmedToBePropertyName = isStylePropertyValue(laterFragment);
                return true;
            });
            var suffix;
            if (confirmedToBePropertyName) {
                suffix = ": ";
            } else if (fragment.Value.substr(-1) !== ")") {
                // It's good practice to always use brackets when specifying a mixin, so we'll enforce it when rewriting
                // the content (it means that analysis about duplicate selectors does not mistakenly consider mixins
                // to be selectors when performing the work)
                suffix = "();";
            } else {
                suffix = ";";
            }
            return fragment.Value + suffix;
        }

        if (isStylePropertyValue(fragment)) {
            return fragment.Values.join(" ") + ";";
        }

        if (isComment(fragment)) {
            var commentContentBuilder = [];
            if (!lastFragmentWroteLineReturn) {
                if ((indentationDepth > 0) || (previousFragments.length > 0)) {
                    // If this is the first comment in a section and there is no line return between it and the previous fragment
                    // then this must be a same-line comment and so will need preceding with a space. In this case there will be
                    // no previous fragment. Similarly, if there IS a previous fragment but no line return between this and it
                    // then a space is required. The only time that no space is required is if indentationDepth is zero and
                    // there are no preceding fragments - this means that the comment is the very first fragment in the
                    // file (not just within the current section) and so no space is required.
                    commentContentBuilder.push(" ");
                }
            }

            // Note: This relies upon standardisation of line returns at the public "Rewrite" entry point
            var contentLines = fragment.Value.split("\n");
            commentContentBuilder.push(contentLines[0]);
            contentLines.forEach(function (contentLine, index) {
                if (index === 0) {
                    return;
                }
                commentContentBuilder.push("\n");
                commentContentBuilder.push(getIndentation(indentationDepth));
                commentContentBuilder.push(" ");
                commentContentBuilder.push(trim(contentLine));
            });
            return commentContentBuilder.join("");
        }

        throw new Error("Unsupported fragment type: " + fragment.GetType());
    };
    
    // This removes any empty selectors (eg. a { }) and "flattens" any nested selectors where the parent selector has only a single child fragment which is
    // itself a selector, where both of these selectors (the parent and child) both have only a single selector target (eg. ul { li { } } becomes ul li { }).
    flattenAnyApplicableSelectors = function (fragments, warningLogger) {
        
        var flattenedFragments = [];
        fragments.forEach(function (fragment) {
            
            if (isMediaQuery(fragment)) {
                var flattenedMediaQueryChildFragments = flattenAnyApplicableSelectors(fragment.ChildFragments, warningLogger);
                if (flattenedMediaQueryChildFragments.length === 0) {
                    // If this is an empty Media Query then don't render it at all
                    warningLogger(
                        "Ignoring empty content media query " + fragment.Selectors.join(", ") + " [line " + (fragment.SourceLineIndex + 1) + "]"
                    );
                    return;
                }

                flattenedFragments.push({
                    FragmentCategorisation: fragment.FragmentCategorisation,
                    Selectors: fragment.Selectors,
                    ParentSelectors: fragment.ParentSelectors,
                    SourceLineIndex: fragment.SourceLineIndex,
                    ChildFragments: flattenedMediaQueryChildFragments
                });
                return;
            }
            
            if (isSelector(fragment)) {
                // If this is an empty Selector then don't render it at all
                var flattenedSelectorChildFragments = flattenAnyApplicableSelectors(fragment.ChildFragments, warningLogger);
                if (flattenedSelectorChildFragments.length === 0) {
                    warningLogger(
                        "Ignoring empty content selector " + fragment.Selectors.join(", ") + " [line " + (fragment.SourceLineIndex + 1) + "]"
                    );
                    return;
                }

                // If this is a scope-restricting "html" tag then we don't want to mess it up. If it has multiple selectors described then we don't want to flatten it
                // as this would involve duplicating the selectors when flattening (which would be both complicated and unproductive - leave the non-trivial flattening
                // to LESS). In fact, only apply this flattening work is there is only a single child fragment and that fragment is another Selector whose SelectorSet
                // has only a single entry (for reasons of preventing duplication again).
                var childSelectorToTargetIfAny;
                var selectorsContent = fragment.Selectors.join(", ");
                if ((selectorsContent === "html") || (fragment.Selectors.length > 1) || (flattenedSelectorChildFragments.length > 1)) {
                    childSelectorToTargetIfAny = null;
                } else if (isSelector(flattenedSelectorChildFragments[0])) {
                    // Note: Don't flatten when there are parent selectors (eg. "&:hover" or "body.Home &") since it's best to leave complicated logic around them
                    // up to the LESS compiler
                    childSelectorToTargetIfAny = flattenedSelectorChildFragments[0];
                    if ((childSelectorToTargetIfAny.Selectors.length > 1) || (childSelectorToTargetIfAny.Selectors[0].indexOf("&") !== -1)) {
                        childSelectorToTargetIfAny = null;
                    }
                } else {
                    childSelectorToTargetIfAny = null;
                }
                if (!childSelectorToTargetIfAny) {
                    flattenedFragments.push({
                        FragmentCategorisation: fragment.FragmentCategorisation,
                        Selectors: fragment.Selectors,
                        ParentSelectors: fragment.ParentSelectors,
                        SourceLineIndex: fragment.SourceLineIndex,
                        ChildFragments: flattenedSelectorChildFragments
                    });
                    return;
                }

                var parentSelectorStringToFlatten = fragment.Selectors[0];
                var childSelectorStringToFlatten = childSelectorToTargetIfAny.Selectors[0];
                warningLogger([
                    "Flattening selectors ",
                    parentSelectorStringToFlatten,
                    " and ",
                    childSelectorStringToFlatten,
                    " [lines ",
                    (fragment.SourceLineIndex + 1),
                    " and ",
                    (childSelectorToTargetIfAny.SourceLineIndex + 1),
                    "]"
                ].join(""));
                flattenedFragments.push({
                    FragmentCategorisation: fragment.FragmentCategorisation,
                    Selectors: [
                        parentSelectorStringToFlatten + " " + childSelectorStringToFlatten
                    ],
                    ParentSelectors: fragment.ParentSelectors,
                    SourceLineIndex: fragment.SourceLineIndex,
                    ChildFragments: flattenAnyApplicableSelectors(childSelectorToTargetIfAny.ChildFragments, warningLogger)
                });
                return;
            }
            
            flattenedFragments.push(fragment);
        });
        return flattenedFragments;
    };
    
    getNumberOfLineReturnsBefore = function (fragment, previousFragments, nextFragments, isOuterMostContent) {
        // If this is the first fragment in a section then it should always mark a new section opening by having a line return before it
        // UNLESS it is the outer most section, in which case no line return is required (otherwise an empty line will be rendered at
        // the top of any content)
        var previousFragmentIfAny = (previousFragments.length === 0) ? null : previousFragments[previousFragments.length - 1];
        if (!previousFragmentIfAny) {
            return isOuterMostContent ? 0 : 1;
        }

        // If this is a comment in a set of multiple comments then there is no need to include line returns between each (they will each
        // get a line return following them so one before the second, third, etc.. ones are unnecessary)
        if (isComment(fragment) && isComment(previousFragmentIfAny)) {
            return 0;
        }

        // If this is a comment that isn't a same-line comment, then there should be at least one line-return before it
        if (isComment(fragment) && (previousFragmentIfAny !== null) && (previousFragmentIfAny.SourceLineIndex !== fragment.SourceLineIndex)) {
            // If the next fragment is a Selector or Media Query then a break between the previous content this Selector / Media Query is
            // required, though this Comment should stick with the next section - so two line returns are required (otherwise, only one
            // is since it's not a new section, it's just another style declaration)
            var nextFragmentIfAny = (nextFragments.length > 0) ? nextFragments[0] : null;
            if ((nextFragmentIfAny !== null) && (isSelector(nextFragmentIfAny) || isMediaQuery(nextFragmentIfAny))) {
                return 2;
            }
            return 1;
        }

        // If this is a Selector or Media Query then it should always have a line return before it to indicate the start of a new section
        if (isSelector(fragment) || isMediaQuery(fragment)) {
            // Note: The case of no-previous-fragments is handled at the top of this method so doesn't need to be considered here
            var fragmentsPreviousToPreviousFragment = previousFragments.slice(0).splice(0, previousFragments.length - 1),
                numberOfLineReturnsBeforeThisFragment = getNumberOfLineReturnsAfter(
                    previousFragmentIfAny,
                    fragmentsPreviousToPreviousFragment,
                    [ fragment ].concat(nextFragments)
                ),
                isThereAlreadyLineReturnBeforeThisFragment = (numberOfLineReturnsBeforeThisFragment > 0),
                previousFragmentWasComment,
                previousFragmentWasSameLineComment;

            // If the previous fragment was not a comment then we want TWO line returns to indicate a divide before this section starts
            previousFragmentWasComment = isComment(previousFragmentIfAny);
            if (!previousFragmentWasComment) {
                return isThereAlreadyLineReturnBeforeThisFragment ? 1 : 2;
            }

            // If the previous fragment was a comment that was a "same-line" comment then that comment is associated with the fragment
            // preceding it and so we also want extra spacing here
            if (fragmentsPreviousToPreviousFragment.length === 0) {
                previousFragmentWasSameLineComment = false;
            } else {
                previousFragmentWasSameLineComment = (
                    previousFragments[previousFragments.length - 1].SourceLineIndex === fragmentsPreviousToPreviousFragment[fragmentsPreviousToPreviousFragment.length - 1].SourceLineIndex
                );
            }
            if (previousFragmentWasSameLineComment) {
                return isThereAlreadyLineReturnBeforeThisFragment ? 1 : 2;
            }

            // Otherwise, the previous fragment was a comment that is associated with this fragment and so no line return is required (that
            // Comment should have sorted out a line return to follow it - but it's not the business of this bit of code to know that so
            // we'll make no assumptions.. returning 0 if the previous fragment was followed by a line return and 1 if not)
            return isThereAlreadyLineReturnBeforeThisFragment ? 0 : 1;
        }
        
        // TODO
        if (isStylePropertyName(fragment) && (isSelector(previousFragmentIfAny) || isMediaQuery(previousFragmentIfAny))) {
            return 2;
        }

        // Any style property name should indicate the start of a new line unless the previous fragment was a Comment that wants to stay
        // associated with the line that the property is on (at the moment, all Comments have trailing line returns so this wouldn't
        // happen, but that's up to the code that deals with Comments to decide)
        if (isStylePropertyName(fragment)) {
            if (isSelector(previousFragmentIfAny) || isMediaQuery(previousFragmentIfAny)) {
                return 2;
            } else if (!isComment(previousFragmentIfAny)) {
                return 1;
            }
        }

        return 0;
    };
    
    getNumberOfLineReturnsAfter = function (fragment, previousFragments, nextFragments) {
        // If this is a same-line comment that is followed by at least one other comments and then a ContainerFragment then include an extra
        // line return since the same-line comment should be associated with the fragment it shares its line with while the following comments
        // should be associated with the new section beneath it.
        var previousFragmentIfAny = (previousFragments.length === 0) ? null : previousFragments[previousFragments.length - 1];
        var nextFragmentIfAny = (nextFragments.length === 0) ? null : nextFragments[0];
        if (isComment(fragment) && (previousFragmentIfAny) && (fragment.SourceLineIndex === previousFragmentIfAny.SourceLineIndex) && isComment(nextFragmentIfAny)) {
            var specialConditionCanNotApply = false;
            var containerFragmentEncountered = false;
            nextFragments.some(function (laterFragment) {
                if (isComment(laterFragment)) {
                    return false;
                }

                if (isSelector(laterFragment) || isMediaQuery(laterFragment)) {
                    containerFragmentEncountered = true;
                } else {
                    specialConditionCanNotApply = true;
                }
                
                // Don't process any more once a non-Comment fragment has been encountered, since at this point we'll have enough information
                // to determine whether this special case applies or not
                return true;
            });
            if (containerFragmentEncountered && !specialConditionCanNotApply) {
                return 2;
            }
        }
        
        // If this is the last fragment then a line return will be required to close the section
        if (nextFragments.length === 0) {
            return 1;
        }

        // To make things easy, Comments should always be followed by line-returns to break them up (if two Comments should be on the
        // same line then they should be a single Comment!)
        if (fragment.FragmentCategorisation === CssParserJs.ExtendedLessParser.FragmentCategorisationOptions.Comment) {
            return 1;
        }
        
        // If there are multiple @import statements, there should be a line return between each
        if (isImport(fragment) && isImport(nextFragmentIfAny)) {
            return 1;
        }

        return 0;
    };
    
    isComment = function (fragmentIfAny) {
        return fragmentIfAny && (fragmentIfAny.FragmentCategorisation === CssParserJs.ExtendedLessParser.FragmentCategorisationOptions.Comment);
    };

    isImport = function (fragmentIfAny) {
        return fragmentIfAny && (fragmentIfAny.FragmentCategorisation === CssParserJs.ExtendedLessParser.FragmentCategorisationOptions.Import);
    };
    
    isSelector = function (fragmentIfAny) {
        return fragmentIfAny && (fragmentIfAny.FragmentCategorisation === CssParserJs.ExtendedLessParser.FragmentCategorisationOptions.Selector);
    };
    
    isMediaQuery = function (fragmentIfAny) {
        return fragmentIfAny && (fragmentIfAny.FragmentCategorisation === CssParserJs.ExtendedLessParser.FragmentCategorisationOptions.MediaQuery);
    };
    
    isStylePropertyName = function (fragmentIfAny) {
        return fragmentIfAny && (fragmentIfAny.FragmentCategorisation === CssParserJs.ExtendedLessParser.FragmentCategorisationOptions.StylePropertyName);
    };
    
    isStylePropertyValue = function (fragmentIfAny) {
        return fragmentIfAny && (fragmentIfAny.FragmentCategorisation === CssParserJs.ExtendedLessParser.FragmentCategorisationOptions.StylePropertyValue);
    };
    
    isSinglePropertyContainer = function (fragmentWithChildFragments) {
        // array.some returns true if any callback returns true - this will be used to indicate that a child fragment has been encountered that means that
        // this is NOT a single-property container fragment (ie. Selector or MediaQuery). All child fragments must be Style Property Names or Values, there
        // must be precisely one Name (though there may be multiple values as "background: white no-repeat;" is described as one Name with two Values).
        var numberOfStylePropertyNames = 0;
        var nonSinglePropertyContentEncountered = fragmentWithChildFragments.ChildFragments.some(function (childFragment) {
            if (isStylePropertyName(childFragment)) {
                numberOfStylePropertyNames = numberOfStylePropertyNames + 1;
                return (numberOfStylePropertyNames > 1);
            }
            return !isStylePropertyValue(childFragment);
        });
        return !nonSinglePropertyContentEncountered && (numberOfStylePropertyNames === 1);
    };
    
    getIndentation = function (indentationDepth) {
        return repeatString(indentationDepth * 4, " ");
    };
                          
    repeatString = function (numberOfTimesToRepeat, value) {
        return (numberOfTimesToRepeat === 0) ? "" : new [].constructor(numberOfTimesToRepeat + 1).join(value);
    };
    
    trim = function (strValue) {
        return strValue.trim ? strValue.trim() : strValue.replace(/^\s+|\s+$/g, "");
    };
                          
    return {
        Rewrite: function (content, warningLogger) {
            // Standardising the line returns makes comment handling require above much more easier
            content = content.replace(/\r\n|\r/g, "\n");
            return rewrite(
                flattenAnyApplicableSelectors(
                    CssParserJs.ExtendedLessParser.ParseIntoStructuredData(content),
                    warningLogger
                ),
                0,
                warningLogger
            );
        }
    };
});