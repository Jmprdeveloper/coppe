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

export async function analyzeInquiryForCompany(
  input: AnalyzeInquiryForCompanyInput
): Promise<InquiryAnalysisResult> {
  const engine = DEFAULT_INQUIRY_ANALYSIS_ENGINE;

  if (engine === "local") {
    return analyzeInquiryWithLocalEngine(input);
  }

  return analyzeInquiryWithLocalEngine(input);
}
