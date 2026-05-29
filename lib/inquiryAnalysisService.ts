import { type CurrentCompany } from "./currentCompany";
import {
  analyzeInquiry,
  type InquiryAnalysisResult,
} from "./inquiryAnalysis";

type InquiryAnalysisEngine = "local";

type AnalyzeInquiryForCompanyInput = {
  customerName: string;
  message: string;
  company: CurrentCompany;
};

const DEFAULT_INQUIRY_ANALYSIS_ENGINE: InquiryAnalysisEngine = "local";

function normalizeInquiryAnalysisEngine(
  value: string | null | undefined
): InquiryAnalysisEngine {
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
  if (engine === "local") {
    return analyzeInquiryWithLocalEngine(input);
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
      return analyzeInquiryWithLocalEngine(input);
    }

    throw error;
  }
}
