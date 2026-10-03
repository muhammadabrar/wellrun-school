import { CERTIFICATE_FIELDS, CERTIFICATE_TYPES, DEFAULT_CERTIFICATES, TEMPLATE_PLACEHOLDERS, certificateIssueSchema, certificateProblem, certificateTemplateSchema, genderWords, renderTemplate, unknownPlaceholders } from "@wellrun/shared";
import { describe, expect, it } from "vitest";

describe("renderTemplate", () => {
  it("fills placeholders, with or without spaces inside the braces", () => {
    expect(renderTemplate("{{student}} of {{ class }}.", { student: "Ayesha Khan", class: "Grade 5 A" })).toBe("Ayesha Khan of Grade 5 A.");
  });

  it("leaves nothing that looks like a mistake when a value is missing", () => {
    expect(renderTemplate("Issued {{purposeLine}}.", {})).toBe("Issued.");
    expect(renderTemplate("Hello {{unknown}} there", {})).toBe("Hello there");
  });

  it("tidies spacing and keeps punctuation attached to the word before it", () => {
    expect(renderTemplate("Conduct was {{conduct}} ,  and good .", { conduct: "Good" })).toBe("Conduct was Good, and good.");
  });

  it("uses a value as given, including Urdu", () => {
    expect(renderTemplate("{{student}} کی", { student: "عائشہ خان" })).toBe("عائشہ خان کی");
  });
});

describe("unknownPlaceholders", () => {
  it("accepts every placeholder the default wording uses", () => {
    for (const type of CERTIFICATE_TYPES) expect(unknownPlaceholders(type, DEFAULT_CERTIFICATES[type].body)).toEqual([]);
  });

  it("catches a typo and a word that belongs to another kind of certificate", () => {
    expect(unknownPlaceholders("BONAFIDE", "Awarded to {{studnet}}")).toEqual(["studnet"]);
    expect(unknownPlaceholders("BONAFIDE", "Left on {{leavingDate}}")).toEqual(["leavingDate"]);
    expect(unknownPlaceholders("LEAVING", "Left on {{leavingDate}} for {{reason}}")).toEqual([]);
  });

  it("reports each unknown word once", () => {
    expect(unknownPlaceholders("MERIT", "{{x}} {{x}} {{y}}")).toEqual(["x", "y"]);
  });
});

describe("default certificates", () => {
  it("fills every field the issuer is asked for somewhere in its wording", () => {
    for (const type of CERTIFICATE_TYPES) {
      const body = DEFAULT_CERTIFICATES[type].body;
      for (const field of CERTIFICATE_FIELDS[type]) {
        const used = field.key === "purpose" ? "purposeLine" : field.key;
        expect(body, `${type} should use ${used}`).toContain(`{{${used}}}`);
      }
    }
  });

  it("produces a complete sentence for each kind with sample details", () => {
    const vars = { student: "Ayesha Khan", guardian: "Imran Khan", admissionNo: "ADM-2026-0001", class: "Grade 5 A", year: "2026-27", dob: "12 March 2015", school: "Greenfield Grammar", date: "3 October 2026", ...genderWords("female"), purposeLine: " This certificate is issued for a passport application.", conduct: "Good", leavingDate: "30 September 2026", reason: "family moved", achievement: "first position in the annual exams" };
    for (const type of CERTIFICATE_TYPES) {
      const text = renderTemplate(DEFAULT_CERTIFICATES[type].body, vars);
      expect(text).not.toContain("{{");
      expect(text).toContain("Ayesha Khan");
      expect(text.endsWith(".")).toBe(true);
    }
    expect(renderTemplate(DEFAULT_CERTIFICATES.BONAFIDE.body, vars)).toContain("daughter of Imran Khan");
  });

  it("is valid wording for the template form", () => {
    for (const type of CERTIFICATE_TYPES) expect(certificateTemplateSchema.safeParse(DEFAULT_CERTIFICATES[type]).success).toBe(true);
  });

  it("only offers placeholders that have help text and a source", () => {
    for (const type of CERTIFICATE_TYPES) expect(new Set(TEMPLATE_PLACEHOLDERS[type]).size).toBe(TEMPLATE_PLACEHOLDERS[type].length);
  });
});

describe("genderWords", () => {
  it("follows the recorded gender", () => {
    expect(genderWords("male")).toEqual({ son_daughter: "son", his_her: "his", him_her: "him" });
    expect(genderWords("Female")).toEqual({ son_daughter: "daughter", his_her: "her", him_her: "her" });
  });

  it("stays neutral when gender isn't recorded rather than guessing", () => {
    for (const g of ["", "unspecified", "other", null, undefined]) expect(genderWords(g)).toEqual({ son_daughter: "child", his_her: "their", him_her: "them" });
  });
});

describe("certificateProblem", () => {
  const today = "2026-10-03";

  it("needs nothing extra for a bonafide certificate", () => {
    expect(certificateProblem("BONAFIDE", {}, today)).toBeNull();
    expect(certificateProblem("BONAFIDE", { purpose: "for a passport application" }, today)).toBeNull();
  });

  it("asks for what a leaving certificate needs", () => {
    expect(certificateProblem("LEAVING", { reason: "moved", conduct: "Good" }, today)).toMatch(/Date of leaving is needed/);
    expect(certificateProblem("LEAVING", { leavingDate: "2026-09-30", conduct: "Good" }, today)).toMatch(/Reason for leaving is needed/);
    expect(certificateProblem("LEAVING", { leavingDate: "2026-09-30", reason: "moved", conduct: "Good" }, today)).toBeNull();
  });

  it("rejects a leaving date in the future or in the wrong shape", () => {
    expect(certificateProblem("LEAVING", { leavingDate: "2026-10-04", reason: "moved", conduct: "Good" }, today)).toMatch(/future/);
    expect(certificateProblem("LEAVING", { leavingDate: "30/09/2026", reason: "moved", conduct: "Good" }, today)).toMatch(/must be a date/);
  });

  it("only accepts a conduct level from the list", () => {
    expect(certificateProblem("CHARACTER", { conduct: "Outstanding" }, today)).toMatch(/Choose a conduct/);
    expect(certificateProblem("CHARACTER", { conduct: "Very good" }, today)).toBeNull();
  });

  it("needs the achievement for a merit certificate", () => {
    expect(certificateProblem("MERIT", { achievement: "   " }, today)).toMatch(/needed/);
    expect(certificateProblem("MERIT", { achievement: "first position" }, today)).toBeNull();
  });
});

describe("certificateIssueSchema", () => {
  it("needs a student and a known kind", () => {
    expect(certificateIssueSchema.safeParse({ studentId: "s1", type: "MERIT", fields: { achievement: "x" } }).success).toBe(true);
    expect(certificateIssueSchema.safeParse({ studentId: "", type: "MERIT" }).success).toBe(false);
    expect(certificateIssueSchema.safeParse({ studentId: "s1", type: "DIPLOMA" }).success).toBe(false);
  });
});
