/*globals define, module*/
/**
 * The registry holds a JSON string {fix, user}.
 * Loading parses that string and joins the parts into one Lean program.
 * Saving splits that program again and stores the JSON string.
 * The joined text has no marker between the parts.
 */
(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    }
}(function () {
    'use strict';

    function namespaceOf(text) {
        var match = String(text || '').match(/^namespace[ \t]+(\S+)/m);
        return match ? match[1] : '';
    }

    function trimmedFix(fix) {
        return String(fix || '').replace(/\n+$/, '');
    }

    function compose(fix, user) {
        var fixed = trimmedFix(fix);
        var ns = namespaceOf(fixed);
        var body = String(user || '').replace(/^\n+/, '').replace(/\n+$/, '');

        if (!fixed) {
            return body ? body + '\n' : '';
        }

        var out = fixed + '\n';
        out += body ? body + '\n' : '\n';
        if (ns) {
            out += 'end ' + ns + '\n';
        }
        return out;
    }

    function splitDocument(text, fix) {
        var fixed = trimmedFix(fix);
        var ns;
        var suffix;
        var lines;
        var head;

        if (!fixed) {
            return null;
        }
        ns = namespaceOf(fixed);
        suffix = ns ? 'end ' + ns : '';
        lines = String(text || '').replace(/\n$/, '').split('\n');
        if (lines.length && lines[lines.length - 1] === suffix && suffix) {
            lines.pop();
        } else if (lines.length && /^end[ \t]+\S+$/.test(lines[lines.length - 1])) {
            lines.pop();
        }
        head = lines.join('\n').replace(/\n+$/, '');
        if (head !== fixed && head.indexOf(fixed) !== 0) {
            return null;
        }
        return {
            fix: fixed + '\n',
            user: head.slice(fixed.length).replace(/^\n+/, '').replace(/\n+$/, '')
        };
    }

    function protect(fix, user, next) {
        var parts;

        if (!trimmedFix(fix)) {
            return next;
        }
        parts = splitDocument(next, fix);
        if (parts) {
            return compose(fix, parts.user);
        }
        return compose(fix, user || '');
    }

    function editableLines(fix, text) {
        var fixed = trimmedFix(fix);
        var ns;
        var lines;
        var endLine;
        var i;

        if (!fixed) {
            return null;
        }
        ns = namespaceOf(fixed);
        lines = String(text || '').replace(/\n$/, '').split('\n');
        endLine = lines.length + 1;
        if (ns) {
            for (i = lines.length - 1; i >= 0; i -= 1) {
                if (lines[i] === 'end ' + ns) {
                    endLine = i + 1;
                    break;
                }
            }
        }
        return {
            first: fixed.split('\n').length + 1,
            last: endLine - 1
        };
    }

    function parse(raw) {
        var text;
        var parsed;

        if (raw == null || raw === '') {
            return {fix: '', user: ''};
        }
        if (typeof raw === 'object') {
            return {fix: raw.fix || '', user: raw.user || ''};
        }
        text = String(raw);
        try {
            parsed = JSON.parse(text);
        } catch (err) {
            parsed = null;
        }
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
                (Object.prototype.hasOwnProperty.call(parsed, 'fix') ||
                    Object.prototype.hasOwnProperty.call(parsed, 'user'))) {
            return {fix: parsed.fix || '', user: parsed.user || ''};
        }
        return {fix: '', user: text};
    }

    function serialize(doc) {
        return JSON.stringify({
            fix: doc && doc.fix || '',
            user: doc && doc.user || ''
        });
    }

    return {
        namespaceOf: namespaceOf,
        compose: compose,
        splitDocument: splitDocument,
        protect: protect,
        editableLines: editableLines,
        parse: parse,
        serialize: serialize
    };
}));
