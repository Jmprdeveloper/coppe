import { type CurrentCompany } from "./currentCompany";
import {
  analyzeInquiry,
  type InquiryAnalysisResult,
} from "./inquiryAnalysis";

type AnalyzeInquiryForCompanyInput = {
  customerName: string;
  message: string;
  company: CurrentCompany;
};

export async function analyzeInquiryForCompany({
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
