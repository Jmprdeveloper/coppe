import { type CurrentCompany } from "./currentCompany";
import { analyzeInquiryWithAiEngine } from "./inquiryAnalysisAi";
import {
  analyzeInquiry,
  type InquiryAnalysisResult,
} from "./inquiryAnalysis";

type InquiryAnalysisEngine = "local" | "ai";

type AnalyzeInquiryForCompanyInput = {
  customerName: string;
  message: string;
  company: CurrentCompany;
};

const DEFAULT_INQUIRY_ANALYSIS_ENGINE: InquiryAnalysisEngine = "local";

function normalizeInquiryAnalysisEngine(
  value: string | null | undefined
): InquiryAnalysisEngine {
  if (value === "ai") {
    return "ai";
  }

  if (value === "local") {
    return "local";
  }

  return DEFAULT_INQUIRY_ANALYSIS_ENGINE;
}

function getInquiryAnalysisEngine(): InquiryAnalysisEngine {
  return normalizeInquiryAnalysisEngine(
    process.env.COPPE_INQUIRY_ANALYSIS_ENGINE
  );
}

async function analyzeInquiryWithLocalEngine({
  customerName,
  message,
  company,
}: AnalyzeInquiryForCompanyInput): Promise<InquiryAnalysisResult> {
  return analyzeInquiry({
    customerName,
    message,
    company,
  });
}

async function analyzeInquiryWithSelectedEngine(
  input: AnalyzeInquiryForCompanyInput,
  engine: InquiryAnalysisEngine
): Promise<InquiryAnalysisResult> {
  if (engine === "ai") {
    return analyzeInquiryWithAiEngine(input);
  }

  return analyzeInquiryWithLocalEngine(input);
}

export async function analyzeInquiryForCompany(
  input: AnalyzeInquiryForCompanyInput
): Promise<InquiryAnalysisResult> {
  const engine = getInquiryAnalysisEngine();

  try {
    return await analyzeInquiryWithSelectedEngine(input, engine);
  } catch (error) {
    if (engine !== "local") {
      console.warn(
        "Inquiry analysis AI engine failed. Falling back to local engine.",
        error
      );

      return analyzeInquiryWithLocalEngine(input);
    }

    throw error;
  }
}
