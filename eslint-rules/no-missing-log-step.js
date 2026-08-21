// @ts-check
'use strict';

/**
 * @fileoverview ESLint rule: no-missing-log-step
 *
 * Enforces that every `this.logger.log(...)`, `this.logger.warn(...)`, and
 * `this.logger.error(...)` call inside a `*.service.ts` file includes a `step`
 * property in the metadata object (second argument).
 *
 * Rationale:
 * The `step` field is the primary queryable attribute in Cloud Logging for audit
 * traces. Without it, logs from multi-step service methods cannot be filtered to
 * a specific phase of an operation, making incident investigation significantly
 * harder (see service-logging-patterns.md §3).
 *
 * Correct:
 *   this.logger.log('User created', { ...ctx, step: 'complete', userId });
 *
 * Incorrect (will warn):
 *   this.logger.log('User created', { ...ctx, userId });  // missing step
 *   this.logger.error('Failed', {});                       // missing step
 *   this.logger.warn('Duplicate found');                   // no meta at all
 *
 * Note: `this.logger.debug(...)` is intentionally excluded — debug calls are often
 * one-liner guard confirmations where the step is implied by context, and gating
 * them strictly would generate too much noise.
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require a `step` property in logger.log/warn/error metadata objects inside service classes',
      url: 'https://github.com/your-org/your-repo/blob/main/.agents/skills/observability-expert/resources/service-logging-patterns.md',
    },
    messages: {
      missingStep:
        "logger.{{ method }}() call is missing a 'step' field in its metadata object. " +
        "Add `step: 'snake_case_name'` to make this log queryable by operation phase in Cloud Logging.",
      missingMeta:
        'logger.{{ method }}() call has no metadata object. ' +
        "Add a second argument `{ ...ctx, step: 'snake_case_name' }` to enable Cloud Logging step queries.",
    },
    schema: [],
  },

  create(context) {
    const ENFORCED_METHODS = new Set(['log', 'warn', 'error']);

    /**
     * Checks whether an ObjectExpression node contains a `step` property.
     * Handles both literal keys (`step: '...'`) and spread elements that
     * re-spread a known object — the spread case is considered passing because
     * we can't statically trace the spreaded value's shape.
     *
     * @param {import('estree').ObjectExpression} node
     * @returns {boolean}
     */
    function hasStepProperty(node) {
      return node.properties.some((prop) => {
        // SpreadElement: `...ctx` — give the benefit of the doubt
        if (prop.type === 'SpreadElement') {
          return false; // don't count a spread as satisfying the requirement
        }
        // Property: key must be `step` (identifier or string literal)
        if (prop.type === 'Property') {
          const key = prop.key;
          return (
            (key.type === 'Identifier' && key.name === 'step') ||
            (key.type === 'Literal' && key.value === 'step')
          );
        }
        return false;
      });
    }

    /**
     * Checks whether an ObjectExpression or any of its spread arguments
     * resolve to something that likely contains `step`. We conservatively
     * pass spreads to avoid false positives on `{ ...ctx, step: 'foo' }`
     * patterns where the spread itself does NOT contain step but the sibling
     * literal property does.
     *
     * @param {import('estree').ObjectExpression} node
     * @returns {boolean}
     */
    function metaObjectHasStep(node) {
      // Check for an explicit `step` literal property
      const hasLiteralStep = node.properties.some((prop) => {
        if (prop.type === 'Property') {
          const key = prop.key;
          return (
            (key.type === 'Identifier' && key.name === 'step') ||
            (key.type === 'Literal' && key.value === 'step')
          );
        }
        return false;
      });
      if (hasLiteralStep) return true;

      // If there are only spread elements and no literal step, we still flag it —
      // a spread of `ctx` should NOT be the only thing; `step` must be explicit.
      return false;
    }

    return {
      CallExpression(node) {
        // Match: this.logger.<method>(...)
        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.object.type !== 'MemberExpression'
        ) {
          return;
        }

        const outerObj = node.callee.object; // `this.logger`
        if (
          outerObj.object.type !== 'ThisExpression' ||
          outerObj.property.type !== 'Identifier' ||
          outerObj.property.name !== 'logger'
        ) {
          return;
        }

        const methodNode = node.callee.property;
        if (methodNode.type !== 'Identifier') return;

        const method = methodNode.name;
        if (!ENFORCED_METHODS.has(method)) return;

        const args = node.arguments;

        // No meta argument at all
        if (args.length < 2) {
          context.report({
            node,
            messageId: 'missingMeta',
            data: { method },
          });
          return;
        }

        const meta = args[1];

        // Meta is an object literal — inspect for `step`
        if (meta.type === 'ObjectExpression') {
          if (!metaObjectHasStep(meta)) {
            context.report({
              node,
              messageId: 'missingStep',
              data: { method },
            });
          }
          return;
        }

        // Meta is a variable reference (e.g., `this.logger.error(err, someVar)`)
        // We can't statically verify this — skip to avoid false positives.
      },
    };
  },
};

module.exports = {
  rules: {
    'no-missing-log-step': rule,
  },
};
