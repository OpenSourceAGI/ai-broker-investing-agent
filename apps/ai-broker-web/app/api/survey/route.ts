import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { v4 as uuidv4 } from "uuid"
import { auth } from "@/lib/auth"

export async function POST(req: NextRequest) {
    try {
        // Get the session to check if user is logged in
        const session = await auth.api.getSession({
            headers: req.headers,
        })

        const body = await req.json()
        const { email, name } = body

        const surveyData = JSON.stringify(body)

        // If user is logged in, update their profile with survey data
        if (session?.user) {
            await db.update(users)
                .set({
                    surveyResponse: surveyData,
                    updatedAt: new Date(),
                })
                .where(eq(users.id, session.user.id))

            return NextResponse.json({ success: true, id: session.user.id, status: "updated" })
        }

        // If not logged in, use email from survey
        if (!email) {
            return NextResponse.json(
                { error: "Email is required" },
                { status: 400 }
            )
        }

        // Check if user exists by email
        const existingUser = await db.query.users.findFirst({
            where: eq(users.email, email),
        })

        if (existingUser) {
            // Update existing user with survey response
            await db.update(users)
                .set({
                    surveyResponse: surveyData,
                    updatedAt: new Date(),
                })
                .where(eq(users.id, existingUser.id))

            return NextResponse.json({ success: true, id: existingUser.id, status: "updated" })
        } else {
            // Create new user
            const id = uuidv4()
            await db.insert(users).values({
                id,
                name: name || email.split("@")[0], // Fallback name
                email,
                surveyResponse: surveyData,
                createdAt: new Date(),
                updatedAt: new Date(),
            })

            return NextResponse.json({ success: true, id, status: "created" })
        }

    } catch (error) {
        console.error("Error submitting survey:", error)
        return NextResponse.json(
            { error: "Failed to submit survey" },
            { status: 500 }
        )
    }
}
