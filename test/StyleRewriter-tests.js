// JSLint Config - QUnit vars and CssParserJs reference
/*global window: false, document: false, $: false, log: false, bleep: false,
    QUnit: false,
    test: false,
    asyncTest: false,
    expect: false,
    module: false,
    ok: false,
    equal: false,
    notEqual: false,
    deepEqual: false,
    notDeepEqual: false,
    strictEqual: false,
    notStrictEqual: false,
    raises: false,
    start: false,
    stop: false,
    CssParserJs: false,
    StyleRewriter: false
*/
(function () {
    "use strict";
    
    var rewriteContent;
    
	test('SimpleExample1', function () {
        var content = "a:hover { color: blue; }",
            expected = "a:hover { color: blue; }\n";
		equal(rewriteContent(content), expected);
	});
    
	test('SimpleExample2', function () {
        var content = [
                "div.MyControl",
                "{",
                "    div.Content",
                "    {",
                "        border: 1px solid black;",
                "",
                "        background: white;",
                "",
                "        h2",
                "        {",
                "            font-size: 20px;",
                "        }",
                "",
                "        p",
                "        {",
                "            line-height: 1.8em;",
                "            font-size: 14px;",
                "",
                "            span",
                "            {",
                "            }",
                "        }",
                "    }",
                "}"
            ].join("\n"),
            expected = [
                "div.MyControl div.Content {",
                "    border: 1px solid black;",
                "    background: white;",
                "",
                "    h2 { font-size: 20px; }",
                "",
                "    p {",
                "        line-height: 1.8em;",
                "        font-size: 14px;",
                "    }",
                "}\n"
            ].join("\n");
		equal(rewriteContent(content), expected);
	});
    
    rewriteContent = function (content) {
        return StyleRewriter.Rewrite(
            content,
            function (message) { }
        );
    };
}());