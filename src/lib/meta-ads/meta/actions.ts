/** Action types we know how to read. Missing actions stay null, not zero. */

export type ActionRow = { action_type: string; value: string };

export type ActionCounts = {
  leads: number;
  landingPageViews: number | null;
  formStarts: number | null;
  instantFormLeads: number | null;
  websiteLeads: number | null;
  callLeads: number | null;
  sawFormStart: boolean;
};

const FORM_START = /form_open|form_start|lead_form_open/i;

export function countActions(actions: ActionRow[] | undefined): ActionCounts {
  if (!actions) {
    return {
      leads: 0,
      landingPageViews: null,
      formStarts: null,
      instantFormLeads: null,
      websiteLeads: null,
      callLeads: null,
      sawFormStart: false,
    };
  }

  const value = (type: string) => {
    const found = actions.find((action) => action.action_type === type);
    return found ? Number(found.value) : 0;
  };
  const formStarts = actions.filter((action) => FORM_START.test(action.action_type));
  const lead = actions.find((action) => action.action_type === "lead");

  return {
    leads: lead ? Number(lead.value) : 0,
    landingPageViews: value("landing_page_view"),
    formStarts: formStarts.length
      ? formStarts.reduce((total, action) => total + Number(action.value), 0)
      : null,
    instantFormLeads: value("onsite_conversion.lead_grouped"),
    websiteLeads: value("offsite_conversion.fb_pixel_lead") + value("onsite_web_lead"),
    callLeads: value("click_to_call_native_call_placed") + value("click_to_call_call_confirm"),
    sawFormStart: formStarts.length > 0,
  };
}
