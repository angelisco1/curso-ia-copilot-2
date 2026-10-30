#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  printf '%s\n' '{"permissionDecision":"deny","permissionDecisionReason":"No se pudo evaluar el hook: se requiere jq."}'
  exit 2
fi

if ! jq -Rcs '
  def deny(reason):
    {permissionDecision: "deny", permissionDecisionReason: reason};

  try (
    fromjson
    | if type != "object" then error("event type") else . end
    | if (.toolName | type) != "string" then error("toolName type") else . end
    | if (.toolName | test("\\S") | not) then error("toolName empty") else . end
    | .toolArgs
    | if type == "string" then fromjson else . end
    | if type != "object" then error("toolArgs type") else . end
    | ([.. | strings] + [.. | objects | keys[]])
    | if any(.[];
        test("(^|[^a-z0-9_.-])constants(\\\\)?\\.js($|[^a-z0-9_.-])"; "i"))
      then deny("Acceso bloqueado: CONSTANTS.js puede contener credenciales.")
      else {}
      end
  ) catch deny("Entrada del hook no valida: se esperaba un evento con toolName y toolArgs validos.")
' 2>/dev/null; then
  printf '%s\n' '{"permissionDecision":"deny","permissionDecisionReason":"No se pudo evaluar la entrada del hook de proteccion."}'
  exit 2
fi
