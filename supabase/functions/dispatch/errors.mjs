// Provider response bodies can contain credentials or private input. Never log
// or return them verbatim. Preserve only bounded machine identifiers for support.
const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(value)?value:undefined;
export function providerFailure(response,payload,stage){
 const code=identifier(payload?.error?.code)||identifier(payload?.error?.type)||'unknown';
 const status=Number(response.status)||502;
 let message='The AI provider could not complete this request. Please retry.';
 if(status===401)message='The server OpenAI credential was rejected. An owner must check OPENAI_API_KEY.';
 else if(code==='insufficient_quota')message='The OpenAI project has no available quota. An owner must check billing and spending limits.';
 else if(status===403||code==='model_not_found')message='The OpenAI project cannot access the configured model or resource. An owner must check model access.';
 else if(status===429)message='The AI provider is rate limited. Please wait and retry.';
 else if(status===400)message='The AI provider rejected the request configuration. An owner must check the server diagnostic.';
 return Object.assign(Error(message),{code:'ai_provider_error',provider_status:status,provider_code:code,provider_param:identifier(payload?.error?.param),provider_stage:identifier(stage),provider_request_id:identifier(response.headers?.get('x-request-id'))});
}
export function failureDetails(error){
 return Object.fromEntries(Object.entries({code:identifier(error?.code)||'dispatch_error',provider_status:Number(error?.provider_status)||undefined,provider_code:identifier(error?.provider_code),provider_param:identifier(error?.provider_param),provider_stage:identifier(error?.provider_stage),provider_request_id:identifier(error?.provider_request_id)}).filter(([,v])=>v!==undefined));
}
