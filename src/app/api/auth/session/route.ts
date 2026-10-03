import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { activatePendingInvitations } from "@/lib/invitations";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req:Request){
  try{
    const{idToken}=await req.json();
    if(typeof idToken!=="string")return NextResponse.json({error:"Missing ID token"},{status:400});
    const{auth,db}=getAdmin();
    const decoded=await auth.verifyIdToken(idToken);
    if(decoded.email&&!decoded.email_verified)return NextResponse.json({error:"Verify your email before continuing",verificationRequired:true},{status:403});
    const token=await auth.createSessionCookie(idToken,{expiresIn:60*60*24*5*1000});
    const userRef=db.doc(`users/${decoded.uid}`);await db.runTransaction(async tx=>{const existing=await tx.get(userRef);tx.set(userRef,{email:decoded.email??null,displayName:decoded.name??null,photoURL:decoded.picture??null,...(!existing.exists||!existing.data()?.createdAt?{createdAt:FieldValue.serverTimestamp()}:{}),updatedAt:FieldValue.serverTimestamp(),lastLoginAt:FieldValue.serverTimestamp()},{merge:true})});
    const activatedInvitations=await activatePendingInvitations(decoded.uid,decoded.email,decoded.email_verified===true).catch(()=>0);
    const res=NextResponse.json({ok:true,activatedInvitations,emailVerificationRequired:false});
    res.cookies.set("toro_session",token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:60*60*24*5});
    return res;
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Invalid credentials"},{status:401})}
}
export async function DELETE(){const res=NextResponse.json({ok:true});res.cookies.set("toro_session","",{httpOnly:true,expires:new Date(0),path:"/"});return res}
