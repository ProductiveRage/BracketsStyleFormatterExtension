/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, brackets, $, window, CSSLint, Mustache */
define(function (require, exports, module) {
    "use strict";
    var AppInit = brackets.getModule("utils/AppInit"),
        ChangedDocumentTracker = brackets.getModule("document/ChangedDocumentTracker"),
        CodeInspection = brackets.getModule("language/CodeInspection"),
        CommandManager = brackets.getModule("command/CommandManager"),
        DocumentManager = brackets.getModule("document/DocumentManager"),
        Dialogs = brackets.getModule("widgets/Dialogs"),
        DefaultDialogs = brackets.getModule("widgets/DefaultDialogs"),
        Menus = brackets.getModule("command/Menus"),
        PanelManager = brackets.getModule("view/PanelManager"),
        CssParserJs = require("CssParserJs"),
        StyleRewriter = require("StyleRewriter"),
        PLUGIN_NAME = "nm|tU Style Rewriter",
        reformatDocumentContent,
        showWarning,
        hideWarning;
    
    reformatDocumentContent = function () {
        var DocumentManager = brackets.getModule("document/DocumentManager"),
            currentDocument = DocumentManager.getCurrentDocument(),
            currentDocumentFile,
            originalContent,
            parseableContent,
            unparseableContent,
            rewrittenContent,
            newContent,
            warning;
        
        hideWarning();

        if (!currentDocument) {
            Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, PLUGIN_NAME, "There is no document option");
            return;
        }
        
        currentDocumentFile = currentDocument.file;
        if (!currentDocumentFile || ((currentDocument.file.fullPath || "").substr(-5).toLowerCase() !== ".less")) {
            Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, PLUGIN_NAME, "This may only be used with .less files");
            return;
        }
        
        // Try to parse the content and display a warning if any parsing errors were encountered
        parseableContent = originalContent = currentDocument.getText();
        try {
            CssParserJs.ExtendedLessParser.ParseIntoStructuredData(parseableContent);
            unparseableContent = "";
            warning = "";
        } catch (e) {
            if (e instanceof CssParserJs.ParseError) {
                unparseableContent = parseableContent.substring(e.indexInSource);
                parseableContent = parseableContent.substring(0, e.indexInSource) + "\n\n\n\n";
                var numberOfLinesInParseableContent = parseableContent.replace(/\r\n|\r/g, "\n").split("\n").length;
                warning = e.message;
            } else {
                Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, PLUGIN_NAME, e.message);
                return;
            }
        }
        
        rewrittenContent = StyleRewriter.Rewrite(
            parseableContent,
            function (message) {
                // The warnings are about flattening unnecessary selectors or removing empty ones, they are not parsing warnings
                // so there's no need to display them anywhere (so this "warningLogger" function does nothing)
            }
        );
        
        if (warning) {
            if (!rewrittenContent) {
                warning += " (at line 1)";
            } else {
                rewrittenContent += "\n\n\n\n";
                var numberOfLineReturnsInRewrittenContent = rewrittenContent.replace(/\r\n|\r/g, "\n").split("\n").length;
                warning += " (at line " + numberOfLineReturnsInRewrittenContent + ")";
            }
        }
        
        // Only update the content if it's different, otherwise there will be steps entered into the Undo history which don't
        // represent changes
        newContent = rewrittenContent + unparseableContent;
        if (originalContent !== newContent) {
            currentDocument.setText(newContent);
        }
        
        if (warning) {
            showWarning(warning);
        }
    };
    
    AppInit.appReady(function () {
        var CMD_ID = "productiverage.lessformatter",
            PANEL_ID = "productiverage.lessformatterwarnings";
        
        CommandManager.register("Format LESS StyleSheet (nm|tU)", CMD_ID, reformatDocumentContent);
        Menus.getMenu(Menus.AppMenuBar.EDIT_MENU).addMenuItem(CMD_ID, "Ctrl-Alt-F");
        
        var $warningsPanel = $("<div id='productiverage-lessformatter-warnings' class='bottom-panel' style='padding: 0.5em;'/>"),
            warningsPanel = PanelManager.createBottomPanel(PANEL_ID, $warningsPanel);
        showWarning = function (content) {
            $warningsPanel.html(content);
            warningsPanel.show();
        };
        hideWarning = function () {
            warningsPanel.hide();
        };
        
        var hookHideWarningOnDocumentChange = function (doc) {
            if (doc) {
                $(doc).on("change", hideWarning);
            }
        };
        var unhookHideWarningOnDocumentChange = function (doc) {
            if (doc) {
                $(doc).off("change", hideWarning);
            }
        };
        hookHideWarningOnDocumentChange(DocumentManager.getCurrentDocument());
        $(DocumentManager).on("currentDocumentChange", function (source, newDocument, oldDocument) {
            hideWarning();
            hookHideWarningOnDocumentChange(newDocument);
            unhookHideWarningOnDocumentChange(oldDocument);
        });
    });
});