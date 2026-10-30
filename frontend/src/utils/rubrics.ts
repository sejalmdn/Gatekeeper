export interface RubricPreset {
  id: string;
  label: string;
  focus: string;
  guidance: string;
  example: string;
}

// Presets supply a focus while developers supply the actual scenario-specific expectation.
export const MULTI_TURN_RUBRIC_PRESETS: RubricPreset[] = [
  {
    id: "history_values",
    label: "Use information from history",
    focus: "Use values from the supplied conversation history correctly.",
    guidance:
      "Identify the values from history and explain how the response must use them.",
    example:
      "Use order ID ORD-42 when explaining the order status, without substituting another ID.",
  },
  {
    id: "earlier_turns",
    label: "Reference earlier turns",
    focus:
      "Acknowledge the required information from earlier turns; paraphrasing is acceptable.",
    guidance:
      "Specify which earlier information the response must acknowledge.",
    example:
      "Acknowledge that the customer already tried restarting the device.",
  },
  {
    id: "conversation_state",
    label: "Respect conversation state",
    focus: "Respond consistently with the established conversation state.",
    guidance:
      "Describe the established state and the behavior you expect in the next response.",
    example:
      "The order is already cancelled. Explain the refund process without suggesting cancellation again.",
  },
];

// Save only the completed criterion, keeping frontend preset identifiers out of the API contract.
export function rubricCriterion(
  presetId: string | undefined,
  expectation: string,
): string {
  const preset = MULTI_TURN_RUBRIC_PRESETS.find((item) => item.id === presetId);
  if (!preset) return expectation;
  return `${preset.focus} Specifically: ${expectation}`;
}

// Explain evaluator failures without implying that the candidate itself failed execution.
export function judgeFailureMessage(
  reason: string | null | undefined,
): string | undefined {
  const messages: Record<string, string> = {
    judge_credential_unavailable:
      "Judge credentials are unavailable. Ask the server administrator to configure the judge.",
    response_unavailable:
      "No candidate response was available for semantic grading.",
    judge_timeout: "The judge request timed out. No rubric score was saved.",
    judge_rate_limited:
      "The judge provider rate-limited this request. No rubric score was saved.",
    judge_authentication_failed:
      "The judge provider rejected authentication. Check the server credential.",
    judge_provider_error: "The judge provider could not complete grading.",
    judge_transport_error: "The server could not reach the judge provider.",
    judge_malformed_output:
      "The judge returned an invalid response. The entire rubric batch was rejected.",
    judge_binding_mismatch:
      "The judge did not return exactly one result per rubric. The entire batch was rejected.",
    judge_truncated_output:
      "The judge response was truncated. The entire rubric batch was rejected.",
    judge_unexpected_tool_calls:
      "The judge unexpectedly requested a tool. The entire rubric batch was rejected.",
    judge_credential_in_input:
      "Grading was stopped because the input contained the judge credential.",
    judge_internal_error:
      "Semantic grading stopped because of an internal error.",
    rubric_unsupported:
      "No supported judge configuration was saved for this evaluation.",
    invocation_unsuccessful:
      "The candidate invocation did not complete successfully, so it could not be graded.",
  };
  return reason ? messages[reason] : undefined;
}
