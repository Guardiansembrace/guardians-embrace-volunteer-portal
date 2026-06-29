"""
Test script — fires all 4 notification emails to ujwalv098@gmail.com
using real SMTP config and real DB data.

Run from the backend directory:
    python scripts/test_notifications.py
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from app.core.email import (
    build_submission_reviewed_html,
    build_admin_comment_html,
    build_join_request_reviewed_html,
    build_join_request_received_html,
    build_member_added_html,
    build_member_removed_html,
    build_work_item_assigned_html,
    build_role_changed_html,
    build_account_status_html,
    send_email,
    is_email_configured,
)

TEST_EMAIL = "ujwalv098@gmail.com"
PORTAL_URL = "http://localhost:5173"


def send_and_report(label: str, to: str, subject: str, html: str):
    print(f"\n{'='*50}")
    print(f"Sending: {label}")
    print(f"  To     : {to}")
    print(f"  Subject: {subject}")
    result = send_email([to], subject, html)
    if result.get("success") or to in result.get("sent_to", []):
        print(f"  Status : SENT")
    else:
        print(f"  Status : FAILED — {result.get('errors') or result.get('error')}")


def main():
    if not is_email_configured():
        print("SMTP not configured — check your .env")
        sys.exit(1)

    print(f"SMTP ready. Sending all test emails to: {TEST_EMAIL}\n")

    # 1. Submission reviewed
    send_and_report(
        label="1. Submission Reviewed",
        to=TEST_EMAIL,
        subject="Your submission for 2026-W17 has been reviewed",
        html=build_submission_reviewed_html(
            volunteer_name="Ujwal V",
            week_id="2026-W17",
            admin_notes="Great work this week! Hours look accurate. Keep it up.",
            submission_id="test-submission-001",
            portal_url=PORTAL_URL,
        ),
    )

    # 2. Admin comment
    send_and_report(
        label="2. Admin Comment on Submission",
        to=TEST_EMAIL,
        subject="Arpita K commented on your submission",
        html=build_admin_comment_html(
            volunteer_name="Ujwal V",
            commenter_name="Arpita K",
            week_id="2026-W17",
            comment_preview="Can you clarify the hours logged on Tuesday? It looks a bit high compared to the description.",
            submission_id="test-submission-001",
            portal_url=PORTAL_URL,
        ),
    )

    # 3. Join request approved
    send_and_report(
        label="3. Join Request Approved",
        to=TEST_EMAIL,
        subject="Your join request for Community Outreach Q2 was approved",
        html=build_join_request_reviewed_html(
            volunteer_name="Ujwal V",
            project_name="Community Outreach Q2",
            approved=True,
            project_id="test-project-001",
            portal_url=PORTAL_URL,
        ),
    )

    # 4. Join request declined
    send_and_report(
        label="4. Join Request Declined",
        to=TEST_EMAIL,
        subject="Your join request for Community Outreach Q2 was declined",
        html=build_join_request_reviewed_html(
            volunteer_name="Ujwal V",
            project_name="Community Outreach Q2",
            approved=False,
            project_id="test-project-001",
            portal_url=PORTAL_URL,
        ),
    )

    # 5. New join request received (admin side)
    send_and_report(
        label="5. New Join Request Received (admin view)",
        to=TEST_EMAIL,
        subject="New join request for Community Outreach Q2 from Ujwal V",
        html=build_join_request_received_html(
            admin_name="Arpita K",
            requester_name="Ujwal V",
            project_name="Community Outreach Q2",
            request_type="access",
            project_id="test-project-001",
            portal_url=PORTAL_URL,
        ),
    )

    # 6. Member added to project
    send_and_report(
        label="6. Member Added to Project",
        to=TEST_EMAIL,
        subject="You've been added to Community Outreach Q2",
        html=build_member_added_html(
            member_name="Ujwal V",
            project_name="Community Outreach Q2",
            project_id="test-project-001",
            added_by_name="Arpita K",
            portal_url=PORTAL_URL,
        ),
    )

    # 7. Member removed from project
    send_and_report(
        label="7. Member Removed from Project",
        to=TEST_EMAIL,
        subject="You've been removed from Community Outreach Q2",
        html=build_member_removed_html(
            member_name="Ujwal V",
            project_name="Community Outreach Q2",
            removed_by_name="Arpita K",
            portal_url=PORTAL_URL,
        ),
    )

    # 8. Work item assigned
    send_and_report(
        label="8. Work Item Assigned",
        to=TEST_EMAIL,
        subject="Work item assigned: Design onboarding flow",
        html=build_work_item_assigned_html(
            assignee_name="Ujwal V",
            work_item_title="Design onboarding flow for new volunteers",
            project_name="Community Outreach Q2",
            project_id="test-project-001",
            assigned_by_name="Arpita K",
            portal_url=PORTAL_URL,
        ),
    )

    # 9. Role changed
    send_and_report(
        label="9. Role Changed",
        to=TEST_EMAIL,
        subject="Your portal role has been updated to Team Lead",
        html=build_role_changed_html(
            user_name="Ujwal V",
            old_role="volunteer",
            new_role="team_lead",
            portal_url=PORTAL_URL,
        ),
    )

    # 10. Account deactivated
    send_and_report(
        label="10. Account Deactivated",
        to=TEST_EMAIL,
        subject="Your Guardian's Embrace account has been deactivated",
        html=build_account_status_html(
            user_name="Ujwal V",
            activated=False,
            portal_url=PORTAL_URL,
        ),
    )

    # 11. Account reactivated
    send_and_report(
        label="11. Account Reactivated",
        to=TEST_EMAIL,
        subject="Your Guardian's Embrace account has been reactivated",
        html=build_account_status_html(
            user_name="Ujwal V",
            activated=True,
            portal_url=PORTAL_URL,
        ),
    )

    print(f"\n{'='*50}")
    print(f"Done. Check {TEST_EMAIL} for all 11 emails.")


if __name__ == "__main__":
    main()
