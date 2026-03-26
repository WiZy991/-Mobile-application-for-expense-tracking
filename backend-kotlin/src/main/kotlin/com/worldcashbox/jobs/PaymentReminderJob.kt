package com.worldcashbox.jobs

import org.quartz.Job
import org.quartz.JobExecutionContext

class PaymentReminderJob : Job {
    override fun execute(context: JobExecutionContext?) {
        // TODO: Implement payment reminder logic
        println("Payment reminder job executed")
    }
}
