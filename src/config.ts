export const DOCUMENT_CONFIG: Record<
  string,
  { r2Key: string; sendgridTemplateId: string; contentType: string }
> = {
  resume: {
    r2Key: "koryporter-resume.pdf",
    contentType: "application/pdf",
    sendgridTemplateId: "d-1b5cd82e87f54ed2b5773def8871e884",
  },
};

export const GENERIC_REJECTION_SENDGRID_TEMPLATE_ID =
  "d-4fba1c7fb46f45a29f9dc239842673a6";
