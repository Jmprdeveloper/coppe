import { type InquiryAnalysisResult } from "./inquiryAnalysis";

export type AnalyzeInquiryRequestBody = {
  customerName?: unknown;
  message?: unknown;
};

export type AnalyzeInquirySuccessResponse = {
  analysis: InquiryAnalysisResult;
  error?: never;
};

export type AnalyzeInquiryErrorResponse = {
  analysis?: never;
  error: string;
};

export type AnalyzeInquiryResponse =
  | AnalyzeInquirySuccessResponse
  | AnalyzeInquiryErrorResponse;
