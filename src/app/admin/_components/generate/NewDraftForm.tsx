"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowCircleRight } from "@phosphor-icons/react";

import { createDraftAction } from "../../_actions/generateDraft";
import { Field, inputCls, StyledSelect } from "../form";
import { Card, ErrorNote, PrimaryButton } from "./shared";

const LANGS = ["English", "Korean", "Japanese"];

export function NewDraftForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("English");
  const [brief, setBrief] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setErr(null);
    start(async () => {
      const res = await createDraftAction({ title, language, brief });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      router.push(`/admin/generate/${res.storyId}/concept`);
    });
  }

  return (
    <Card title="New story">
      <Field label="Title">
        <input
          className={inputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. The Lantern Fox"
        />
      </Field>
      <Field label="Language">
        <StyledSelect
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="max-w-[14rem]"
        >
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </StyledSelect>
      </Field>
      <Field label="Brief">
        <textarea
          className={`${inputCls} min-h-28`}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="A shy little fox who lights lanterns for lost travellers learns that asking for help is brave too…"
        />
      </Field>
      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="flex justify-end">
        <PrimaryButton onClick={submit} disabled={pending || !title.trim() || !brief.trim()}>
          {pending ? (
            "Creating…"
          ) : (
            <>
              Create Draft
              <ArrowCircleRight weight="fill" className="h-4 w-4" />
            </>
          )}
        </PrimaryButton>
      </div>
    </Card>
  );
}
