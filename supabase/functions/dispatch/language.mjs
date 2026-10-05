// Optional language understanding. It only returns a constrained intent; it cannot act on driver apps.
export function makeLanguageParser({apiKey,model,fetchImpl=fetch,engine}){
 const allowed=['mode','plan','why','earnings','target','unknown'];
 return async utterance=>{
  if(typeof utterance!=='string'||utterance.length>1000)throw Error('Voice request must be shorter than 1,000 characters.');
  const local=engine.parseCommand(utterance);if(local.type!=='unknown'||!apiKey||!model)return{command:local,provider:local.type==='unknown'?'not_configured':'local',execution:'advisory'};
  const schema={type:'object',additionalProperties:false,required:['type','mode','amount','additional','thenHome','remaining'],properties:{type:{type:'string',enum:allowed},mode:{type:['string','null'],enum:[...engine.MODES,null]},amount:{type:['number','null']},additional:{type:'boolean'},thenHome:{type:'boolean'},remaining:{type:'boolean'}}};
  const response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,instructions:'Parse a rideshare driver voice command into the supported intent. Never claim any action executed. Never invent earnings, trips, location, prices or capabilities. Unknown when ambiguous. Do not produce driving directions.',input:utterance,max_output_tokens:300,text:{format:{type:'json_schema',name:'dispatch_intent',strict:true,schema}}})});
  if(!response.ok)throw Error('Cloud language understanding unavailable. Local commands still work.');
  const payload=await response.json(),content=(payload.output||[]).flatMap(o=>o.content||[]).find(c=>c.type==='output_text')?.text;
  if(!content)throw Error('No supported intent returned.');const command=JSON.parse(content);
  if(!allowed.includes(command.type)||(command.type==='mode'&&!engine.MODES.includes(command.mode))||(command.type==='target'&&(!Number.isFinite(command.amount)||command.amount<=0||command.amount>100000)))throw Error('Unsupported intent.');
  return{command,provider:'OpenAI',execution:'advisory'};
 };
}
