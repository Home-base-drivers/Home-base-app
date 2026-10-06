const voices=new Set(['alloy','ash','ballad','coral','echo','fable','nova','onyx','sage','shimmer','verse','marin','cedar']);
const styles=new Set(['all','masculine','feminine']);
const localeNames={
 'en-US':'American English','en-GB':'British English','en-CA':'Canadian English','en-AU':'Australian English','en-IE':'Irish English','en-IN':'Indian English',
 'es-DO':'Dominican Spanish','es-US':'US Spanish','es-MX':'Mexican Spanish','es-PR':'Puerto Rican Spanish','es-CO':'Colombian Spanish','es-AR':'Argentinian Spanish','es-ES':'Spanish from Spain',
 'zh-CN':'Mandarin Chinese from mainland China','zh-TW':'Mandarin Chinese from Taiwan','zh-SG':'Mandarin Chinese from Singapore',
 'hi-IN':'Hindi from India','ar-SA':'Arabic from Saudi Arabia','ar-EG':'Egyptian Arabic','ar-AE':'Arabic from the UAE',
 'fr-FR':'French from France','fr-CA':'Canadian French','fr-BE':'Belgian French','fr-CH':'Swiss French',
 'bn-BD':'Bengali from Bangladesh','bn-IN':'Bengali from India','pt-BR':'Brazilian Portuguese','pt-PT':'European Portuguese',
 'ru-RU':'Russian','ur-PK':'Urdu from Pakistan','ur-IN':'Urdu from India','id-ID':'Indonesian',
 'de-DE':'German from Germany','de-AT':'Austrian German','de-CH':'Swiss German','ja-JP':'Japanese',
 'vi-VN':'Vietnamese','tr-TR':'Turkish','ta-IN':'Tamil from India','ta-LK':'Tamil from Sri Lanka','ta-SG':'Tamil from Singapore',
 'te-IN':'Telugu','mr-IN':'Marathi','ko-KR':'Korean','it-IT':'Italian','it-CH':'Italian from Switzerland'
};
export const HOMEBASE_AI_VOICES=['cedar','marin','onyx','coral','sage','nova','echo','ash','verse','shimmer','alloy','ballad','fable'];

export function makeVoiceSynthesizer({apiKey,model='gpt-4o-mini-tts',fetchImpl=fetch}){
 return async({text,locale='en-US',voice='cedar',style='all'}={})=>{
  if(!apiKey)return{configured:false};
  if(typeof text!=='string'||!text.trim()||text.length>2400)throw Error('Voice reply must be between 1 and 2,400 characters.');
  if(typeof locale!=='string'||!localeNames[locale])throw Error('Unsupported voice locale.');
  if(!voices.has(voice))throw Error('Unsupported AI voice.');
  if(!styles.has(style))throw Error('Unsupported voice style.');
  const accent=localeNames[locale],presentation=style==='masculine'?'Use a natural masculine vocal presentation.':style==='feminine'?'Use a natural feminine vocal presentation.':'Use a natural, balanced vocal presentation.';
  const instructions='You are the Home Base driver copilot. Speak exactly the supplied text without adding, removing, translating, or paraphrasing words. Speak naturally in '+accent+'. Use the regional accent associated with '+accent+' when appropriate. '+presentation+' Sound warm, confident, clear, conversational, and human-like rather than robotic. Keep a calm driving-assistant pace with natural intonation.';
  const response=await fetchImpl('https://api.openai.com/v1/audio/speech',{method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model,voice,input:text,instructions,response_format:'mp3'})});
  if(!response.ok)throw Error('AI voice service unavailable.');
  const audio=new Uint8Array(await response.arrayBuffer());if(!audio.length)throw Error('AI voice returned no audio.');
  return{configured:true,audio,contentType:response.headers.get('content-type')||'audio/mpeg',provider:'OpenAI',voice,locale,style};
 };
}
